'use server'

import { and, asc, eq, gte, isNull, lt, lte, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  compradores,
  contasMarketplace,
  eventosFull,
  orcamentoParcelas,
  orcamentos,
  ordensProducao,
  produtos,
  remessasFull,
} from '@/lib/db/schema'
import { situacaoDaParcela, type SituacaoDaParcela } from '@/lib/parcela-estado'
import {
  diaEmBrasilia,
  hojeEmBrasilia,
  inicioDoDiaEmBrasilia,
  somarDias,
} from '@/lib/dia-brasil'
import {
  eventoFullSchema,
  type EventoFullInput,
} from '@/lib/validators/eventos'
import { producaoAtrasada } from '@/lib/producao/atraso-da-op'
import { type prioridadeValues, type statusValues } from '@/lib/validators/ordens'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Tipos expostos ao client
// -----------------------------------------------------------------

export type EventoFullItem = {
  id: string
  data: string // YYYY-MM-DD
  canal: 'full_ml' | 'full_shopee'
  observacao: string | null
  // true quando vem de uma remessa Full real (cadastrada em Ordens):
  // aparece automaticamente e não pode ser excluída pelo calendário.
  remessa?: boolean
  /**
   * Nome da conta ("Conta 1 ML"). Null no evento antigo, de antes de as
   * contas existirem — caso normal e permanente, ver a migration 69.
   */
  contaNome: string | null
}

/**
 * Boleto/cheque a receber que cai no mês visível.
 *
 * ⚠️ SÓ O ADMIN VÊ ISTO, e a checagem é no SERVIDOR — ver
 * `listarParcelasDoPeriodo`.
 */
export type ParcelaAgendaItem = {
  id: string
  data: string // YYYY-MM-DD (vencimento)
  numero: number
  orcamentoId: string
  orcamentoNumero: number
  cliente: string
  valor: string
  situacao: SituacaoDaParcela
}

export type OpAgendaItem = {
  id: string
  numero: string
  produtoNome: string
  data: string // YYYY-MM-DD (data prevista de fim)
  prioridade: (typeof prioridadeValues)[number]
  status: (typeof statusValues)[number]
  atrasada: boolean
}

// -----------------------------------------------------------------
// Leitura do mês (recebe range YYYY-MM-DD inclusivo)
// -----------------------------------------------------------------

export async function listarEventosFull(
  inicio: string,
  fim: string,
): Promise<EventoFullItem[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: eventosFull.id,
      data: eventosFull.data,
      canal: eventosFull.canal,
      observacao: eventosFull.observacao,
      // leftJoin: evento antigo não tem conta e precisa continuar aparecendo.
      contaNome: contasMarketplace.nome,
    })
    .from(eventosFull)
    .leftJoin(
      contasMarketplace,
      eq(contasMarketplace.id, eventosFull.contaId),
    )
    .where(
      and(
        isNull(eventosFull.deletedAt),
        gte(eventosFull.data, inicio),
        lte(eventosFull.data, fim),
      ),
    )
    .orderBy(asc(eventosFull.data))

  // Remessas Full reais (cadastradas em Ordens) entram automaticamente,
  // com a contagem de OPs/peças na observação (vira tooltip).
  const remessas = await db
    .select({
      id: remessasFull.id,
      data: remessasFull.dataEnvio,
      canal: remessasFull.canal,
      // A remessa real já sabe a conta desde sempre — o calendário é que não
      // mostrava.
      contaNome: contasMarketplace.nome,
      // Qualifica "remessas_full"."id" — sem isso o Postgres correlaciona
      // com o `id` da própria subquery (ordens_producao) e o valor nunca
      // bate (sempre 0).
      ops: sql<number>`(
        SELECT COUNT(*)::int FROM ${ordensProducao}
        WHERE ${ordensProducao.remessaFullId} = "remessas_full"."id"
          AND ${ordensProducao.deletedAt} IS NULL
          AND ${ordensProducao.status} <> 'cancelado'
      )`,
      unidades: sql<number>`(
        SELECT COALESCE(SUM(${ordensProducao.quantidade}), 0)::int
        FROM ${ordensProducao}
        WHERE ${ordensProducao.remessaFullId} = "remessas_full"."id"
          AND ${ordensProducao.deletedAt} IS NULL
          AND ${ordensProducao.status} <> 'cancelado'
      )`,
    })
    .from(remessasFull)
    .leftJoin(
      contasMarketplace,
      eq(contasMarketplace.id, remessasFull.contaId),
    )
    .where(
      and(
        isNull(remessasFull.deletedAt),
        gte(remessasFull.dataEnvio, inicio),
        lte(remessasFull.dataEnvio, fim),
      ),
    )
    .orderBy(asc(remessasFull.dataEnvio))

  const itens: EventoFullItem[] = [
    ...rows.map(
      (r): EventoFullItem => ({
        id: r.id,
        data: r.data,
        canal: (r.canal === 'full_shopee' ? 'full_shopee' : 'full_ml') as
          | 'full_ml'
          | 'full_shopee',
        observacao: r.observacao ?? null,
        contaNome: r.contaNome ?? null,
      }),
    ),
    ...remessas.map(
      (r): EventoFullItem => ({
        id: r.id,
        data: r.data,
        canal: r.canal as 'full_ml' | 'full_shopee',
        observacao: `${r.ops} OPs · ${r.unidades} un`,
        remessa: true,
        contaNome: r.contaNome ?? null,
      }),
    ),
  ]

  itens.sort((a, b) => a.data.localeCompare(b.data))
  return itens
}

/**
 * Boletos e cheques a receber do período — o terceiro tipo de marca do
 * calendário.
 *
 * ⚠️ SÓ ADMIN, checado AQUI, no servidor, ANTES da consulta: pra quem não é,
 * a consulta não acontece e nada disso atravessa pro cliente.
 *
 * ⚠️ E É `role === 'admin'`, NÃO a área `pedidos`. Parece a checagem "certa",
 * mas o gerente de produção tem 'total' em `pedidos` por override gravado —
 * trocar por área colocaria o contas-a-receber da casa no calendário dele.
 * Se um dia isso tiver que virar área, que seja área PRÓPRIA, decidida de
 * propósito.
 *
 * NÃO RECEBIDAS, e não "a vencer": a que venceu semana passada e ninguém deu
 * baixa é justamente a que precisa aparecer. O estado (vence hoje / atrasada)
 * sai de `situacaoDaParcela`, a MESMA função do sino e da tela do pedido —
 * duas contas de "venceu" que discordam é o defeito que aquele módulo existe
 * pra evitar.
 */
export async function listarParcelasDoPeriodo(
  inicio: string,
  fim: string,
): Promise<ParcelaAgendaItem[]> {
  const user = await requireAuth()
  if (user.role !== 'admin') return []

  const linhas = await db
    .select({
      id: orcamentoParcelas.id,
      vencimento: orcamentoParcelas.vencimento,
      numero: orcamentoParcelas.numero,
      valor: orcamentoParcelas.valor,
      orcamentoId: orcamentos.id,
      orcamentoNumero: orcamentos.numero,
      cliente: orcamentos.cliente,
      compradorNome: compradores.nome,
    })
    .from(orcamentoParcelas)
    .innerJoin(orcamentos, eq(orcamentos.id, orcamentoParcelas.orcamentoId))
    .leftJoin(compradores, eq(compradores.id, orcamentos.compradorId))
    .where(
      and(
        isNull(orcamentoParcelas.recebidoEm),
        isNull(orcamentos.deletedAt),
        // Pedido cancelado não tem o que cobrar.
        ne(orcamentos.status, 'cancelado'),
        gte(orcamentoParcelas.vencimento, inicio),
        lte(orcamentoParcelas.vencimento, fim),
      ),
    )
    .orderBy(asc(orcamentoParcelas.vencimento))

  // Um `hoje` só pra lista inteira: duas chamadas podem cair em dias
  // diferentes se a requisição atravessar a meia-noite.
  const hoje = hojeEmBrasilia()
  return linhas.map((p) => ({
    id: p.id,
    data: p.vencimento,
    numero: p.numero,
    orcamentoId: p.orcamentoId,
    orcamentoNumero: p.orcamentoNumero,
    cliente: p.compradorNome ?? p.cliente,
    valor: p.valor,
    situacao: situacaoDaParcela(p.vencimento, null, hoje),
  }))
}

export async function listarOpsComPrazo(
  inicio: string,
  fim: string,
): Promise<OpAgendaItem[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      produtoNome: produtos.nome,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      prioridade: ordensProducao.prioridade,
      status: ordensProducao.status,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.status, 'cancelado'),
        // ⚠️ A JANELA EM INSTANTES DE BRASÍLIA, e não `::date`: o prazo é o
        // FIM do dia em Brasília (`fimDoDiaEmBrasilia`), 02:59 do dia
        // SEGUINTE em UTC — `::date` na sessão UTC poria a OP no dia errado.
        gte(ordensProducao.dataPrevistaFim, inicioDoDiaEmBrasilia(inicio)),
        lt(
          ordensProducao.dataPrevistaFim,
          inicioDoDiaEmBrasilia(somarDias(fim, 1)),
        ),
      ),
    )
    .orderBy(asc(ordensProducao.dataPrevistaFim))

  const now = Date.now()
  return rows
    .filter((r): r is typeof r & { dataPrevistaFim: Date } =>
      Boolean(r.dataPrevistaFim),
    )
    .map((r) => {
      const d = new Date(r.dataPrevistaFim)
      // O dia de BRASÍLIA do prazo. Com `getUTC*`, todo prazo (o do Full já
      // era assim) caía no quadradinho do dia seguinte.
      const ymd = diaEmBrasilia(d)
      return {
        id: r.id,
        numero: r.numero,
        produtoNome: r.produtoNome,
        data: ymd,
        prioridade: r.prioridade,
        status: r.status,
        // Atrasada é a PRODUÇÃO não concluída, não a OP sem baixa — atraso-da-op.ts.
        atrasada: producaoAtrasada(r.status, d, now),
      }
    })
}

// -----------------------------------------------------------------
// Criar / excluir evento Full
// -----------------------------------------------------------------

export async function criarEventoFullAction(
  input: EventoFullInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('calendario')

  const parsed = eventoFullSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // A CONTA DECIDE O CANAL. O formulário escolhe a conta (uma escolha em vez
  // de duas), e o canal vem dela — assim nunca mais existe a combinação
  // impossível de "Full ML" com uma conta da Shopee. Sem conta escolhida,
  // vale o canal que veio, que é o caminho dos eventos antigos.
  let canal = data.canal
  if (data.contaId) {
    const [conta] = await db
      .select({ canal: contasMarketplace.canal })
      .from(contasMarketplace)
      .where(
        and(
          eq(contasMarketplace.id, data.contaId),
          isNull(contasMarketplace.deletedAt),
        ),
      )
      .limit(1)
    if (!conta) return { success: false, error: 'Conta não encontrada' }
    if (conta.canal !== 'full_ml' && conta.canal !== 'full_shopee') {
      return { success: false, error: 'Essa conta não é de envio Full' }
    }
    canal = conta.canal
  }

  const [inserted] = await db
    .insert(eventosFull)
    .values({
      data: data.data,
      canal,
      contaId: data.contaId ?? null,
      observacao: data.observacao ?? null,
    })
    .returning({ id: eventosFull.id })

  revalidatePath('/calendario')
  return { success: true, data: { id: inserted!.id }, message: 'Envio agendado' }
}

export async function excluirEventoFullAction(
  id: string,
): Promise<ActionResult> {
  await requireAreaEscrita('calendario')

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return { success: false, error: 'ID inválido' }
  }

  await db
    .update(eventosFull)
    .set({ deletedAt: new Date() })
    .where(and(eq(eventosFull.id, id), isNull(eventosFull.deletedAt)))

  revalidatePath('/calendario')
  return { success: true, message: 'Envio removido' }
}
