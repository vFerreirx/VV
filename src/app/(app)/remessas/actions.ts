'use server'

import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { gravarBaixa } from '@/lib/db/baixa-da-op'
import { diasEntre, hojeEmBrasilia, somarDias } from '@/lib/dia-brasil'
import {
  apontamentosProducao,
  contasMarketplace,
  eventosKanban,
  ordensProducao,
  produtos,
  remessasFull,
  variacoesProduto,
} from '@/lib/db/schema'
import {
  diaMes,
  erroDoProducaoAte,
  prazoDaOp,
  producaoAteEfetivo,
  riscoDaRemessa,
  rotuloDaRemessa,
  type RiscoDaRemessa,
} from '@/lib/producao/prazo-da-remessa'
import { erroDaTransicaoGenerica } from '@/lib/producao/transicoes-da-op'
import {
  STATUS_KANBAN,
  type StatusKanban,
  type statusValues,
} from '@/lib/validators/ordens'

// O risco e os prazos da remessa moram em src/lib/producao/prazo-da-remessa.ts
// (RISCO_DIAS, a folga, a classificação). Aqui só se lê o banco e se chama.

// Era uma TERCEIRA cópia da lista de etapas do kanban, montada por subtração
// (`Exclude<..., 'enviado' | 'cancelado'>`) e com um cast por cima. Agora é
// só o alias: STATUS_KANBAN já vem estreito, então tirar uma coluna do board
// quebra o build aqui em vez de deixar a tela contando etapa inexistente.
export type EtapaKanban = StatusKanban

export type EtapaContagem = {
  status: EtapaKanban
  count: number
}

export type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }

// OP ATIVA = não excluída e não cancelada. Mesma definição usada pra montar
// a lista de remessas abertas e pra decidir se uma remessa pode ser excluída.
const opAtiva = and(
  isNull(ordensProducao.deletedAt),
  ne(ordensProducao.status, 'cancelado'),
)

export type RemessaAberta = {
  id: string
  canal: 'full_ml' | 'full_shopee'
  dataEnvio: string
  contaId: string | null
  /** O prazo da produção que VALE (o escolhido, ou o padrão). */
  producaoAte: string
  /** O que está gravado: null = padrão. É o que o "Editar" parte. */
  producaoAteGravado: string | null
  diasAteProducao: number
  // Nulo nas remessas criadas antes do cadastro de contas — a tela mostra
  // "sem conta" e segue funcionando.
  contaNome: string | null
  ops: number
  opsProntas: number
  unidades: number
  produzidas: number
  atrasadas: number
  pronta: boolean
  etapas: EtapaContagem[]
  // Etapa mais atrás do fluxo que ainda tem OP parada (null = remessa pronta).
  gargalo: EtapaKanban | null
  // Dias até a DATA DE ENVIO — o "faltam N dias" do card.
  diasRestantes: number
  risco: RiscoDaRemessa
}

// `dataEnvio` é coluna `date` (dia de calendário, sem fuso), então a conta é
// dia contra dia — o T12:00:00Z dos dois lados é só pra fugir de qualquer
// borda de horário de verão no meio do subtrai. O "hoje" tem que ser o de
// BRASÍLIA: com o dia do servidor (UTC na Vercel), das 21h à meia-noite toda
// remessa aparecia um dia mais perto do prazo do que está, e a classificação
// no_prazo/em_risco/atrasada logo abaixo decidia operação em cima disso.
function diasAte(dia: string): number {
  return diasEntre(hojeEmBrasilia(), dia)
}

// Remessas Full ABERTAS (alguma OP não-cancelada ainda não enviada), com
// progresso agregado em UMA query (GROUP BY) — nada de query por remessa.
export async function listarRemessasAbertas(): Promise<RemessaAberta[]> {
  await requireArea('remessas')

  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      producaoAte: remessasFull.producaoAte,
      contaId: remessasFull.contaId,
      contaNome: contasMarketplace.nome,
      ops: sql<number>`count(*)::int`,
      opsProntas: sql<number>`count(*) filter (
        where ${ordensProducao.status} in ('pronto_envio', 'enviado')
      )::int`,
      pendentes: sql<number>`count(*) filter (
        where ${ordensProducao.status} <> 'enviado'
      )::int`,
      unidades: sql<number>`coalesce(sum(${ordensProducao.quantidade}), 0)::int`,
      // Qualifica "ordens_producao"."id" — a subquery é sobre
      // apontamentos_producao, que também tem `id` próprio (mesmo cuidado
      // do bug corrigido em produção/actions.ts).
      produzidas: sql<number>`coalesce(sum(
        LEAST(${ordensProducao.quantidade}, (
          SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)
          FROM ${apontamentosProducao}
          WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
        ))
      ), 0)::int`,
      atrasadas: sql<number>`count(*) filter (
        where ${ordensProducao.status} <> 'enviado'
          and ${ordensProducao.dataPrevistaFim} < now()
      )::int`,
      aguardandoMateriaPrima: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'aguardando_materia_prima'
      )::int`,
      programado: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'programado'
      )::int`,
      emProducao: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'em_producao'
      )::int`,
      prontoEnvio: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'pronto_envio'
      )::int`,
    })
    .from(remessasFull)
    .innerJoin(
      ordensProducao,
      and(
        eq(ordensProducao.remessaFullId, remessasFull.id),
        opAtiva,
      ),
    )
    // leftJoin, não innerJoin: remessa sem conta (as antigas) tem que
    // continuar aparecendo.
    .leftJoin(
      contasMarketplace,
      eq(contasMarketplace.id, remessasFull.contaId),
    )
    .where(isNull(remessasFull.deletedAt))
    .groupBy(
      remessasFull.id,
      remessasFull.canal,
      remessasFull.dataEnvio,
      remessasFull.producaoAte,
      remessasFull.contaId,
      contasMarketplace.nome,
    )
    .orderBy(asc(remessasFull.dataEnvio))

  const contagemPorEtapa = {
    aguardando_materia_prima: 'aguardandoMateriaPrima',
    programado: 'programado',
    em_producao: 'emProducao',
    pronto_envio: 'prontoEnvio',
  } as const satisfies Record<EtapaKanban, string>

  return rows
    .filter((r) => r.pendentes > 0)
    .map((r): RemessaAberta => {
      const etapas: EtapaContagem[] = STATUS_KANBAN.map((status) => ({
        status,
        count: r[contagemPorEtapa[status] as keyof typeof r] as number,
      }))
      const pronta = r.ops === r.opsProntas
      const gargalo = pronta
        ? null
        : (etapas.find((e) => e.count > 0)?.status ?? null)
      const diasRestantes = diasAte(r.dataEnvio)
      // ⚠️ O RISCO CONTA DO PRAZO DA PRODUÇÃO, e não do envio. Contando do
      // envio, o "atrasada" só acendia quando o caminhão já tinha saído.
      const producaoAte = producaoAteEfetivo(r)
      const diasAteProducao = diasAte(producaoAte)
      const risco = riscoDaRemessa({
        producaoConcluida: pronta,
        diasAteProducao,
        diasAteEnvio: diasRestantes,
      })

      return {
        id: r.id,
        canal: r.canal as 'full_ml' | 'full_shopee',
        dataEnvio: r.dataEnvio,
        contaId: r.contaId,
        producaoAte,
        producaoAteGravado: r.producaoAte,
        diasAteProducao,
        contaNome: r.contaNome ?? null,
        ops: r.ops,
        opsProntas: r.opsProntas,
        unidades: r.unidades,
        produzidas: r.produzidas,
        atrasadas: r.atrasadas,
        pronta,
        etapas,
        gargalo,
        diasRestantes,
        risco,
      }
    })
}

export type OpDaRemessa = {
  id: string
  numero: string
  remessaFullId: string
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoTamanho: string | null
  quantidade: number
  produzido: number
  status: (typeof statusValues)[number]
  /** Pra o despacho decidir, com a regra da baixa, o que vai e o que fica. */
  temApontamento: boolean
  atrasada: boolean
}

// OPs de um conjunto de remessas, numa query só (evita N+1 ao expandir cada
// card no client).
export async function listarOpsDasRemessas(
  remessaIds: string[],
): Promise<OpDaRemessa[]> {
  await requireArea('remessas')
  if (remessaIds.length === 0) return []

  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      remessaFullId: ordensProducao.remessaFullId,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoTamanho: variacoesProduto.tamanho,
      quantidade: ordensProducao.quantidade,
      status: ordensProducao.status,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      temApontamento: sql<boolean>`EXISTS (
        SELECT 1 FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
      // Mesma qualificação manual de "ordens_producao"."id" usada no kanban.
      produzido: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .where(
      and(
        inArray(ordensProducao.remessaFullId, remessaIds),
        opAtiva,
      ),
    )
    .orderBy(asc(ordensProducao.status), asc(ordensProducao.numero))

  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    remessaFullId: r.remessaFullId!,
    produtoNome: r.produtoNome,
    produtoSku: r.produtoSku,
    variacaoCor: r.variacaoCor ?? null,
    variacaoTamanho: r.variacaoTamanho ?? null,
    quantidade: r.quantidade,
    produzido: r.produzido,
    status: r.status,
    temApontamento: r.temApontamento,
    atrasada:
      r.dataPrevistaFim !== null &&
      r.status !== 'enviado' &&
      new Date(r.dataPrevistaFim).getTime() < now,
  }))
}

// -----------------------------------------------------------------
// Remessas encalhadas + exclusão
// -----------------------------------------------------------------

export type RemessaSemOp = {
  id: string
  canal: 'full_ml' | 'full_shopee'
  dataEnvio: string
  envioId: string | null
  contaNome: string | null
  // OPs que existiram e foram excluídas ou canceladas. Zero = remessa criada
  // e nunca usada.
  opsInativas: number
}

// Remessa sem NENHUMA OP ativa. Ela não aparece na lista de abertas (que
// exige OP pendente), então antes disso ficava invisível pra sempre — e como
// a trava de duplicidade da importação Full olha a remessa, o envio nunca
// mais podia ser reimportado. É exatamente o que esta lista destrava.
//
// ATENÇÃO ao "remessas_full"."id" escrito à mão: numa consulta de tabela
// única o Drizzle NÃO qualifica as colunas do select, então `${remessasFull.id}`
// sairia como `"id"` — e dentro da subconsulta o Postgres resolveria isso
// como `ordens_producao.id`, comparando a OP com ela mesma e devolvendo zero
// sempre. Mesmo cuidado já tomado no kanban e em listarOpsDasRemessas.
export async function listarRemessasSemOp(): Promise<RemessaSemOp[]> {
  await requireArea('remessas')

  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      envioId: remessasFull.envioId,
      contaNome: contasMarketplace.nome,
      ativas: sql<number>`(
        SELECT count(*) FROM ${ordensProducao} o
        WHERE o.remessa_full_id = "remessas_full"."id"
          AND o.deleted_at IS NULL AND o.status <> 'cancelado'
      )::int`,
      inativas: sql<number>`(
        SELECT count(*) FROM ${ordensProducao} o
        WHERE o.remessa_full_id = "remessas_full"."id"
          AND (o.deleted_at IS NOT NULL OR o.status = 'cancelado')
      )::int`,
    })
    .from(remessasFull)
    .leftJoin(
      contasMarketplace,
      eq(contasMarketplace.id, remessasFull.contaId),
    )
    .where(isNull(remessasFull.deletedAt))
    .orderBy(desc(remessasFull.dataEnvio))

  return rows
    .filter((r) => r.ativas === 0)
    .map((r) => ({
      id: r.id,
      canal: r.canal as 'full_ml' | 'full_shopee',
      dataEnvio: r.dataEnvio,
      envioId: r.envioId,
      contaNome: r.contaNome ?? null,
      opsInativas: r.inativas,
    }))
}

// Exclusão SUAVE: a remessa vai pra lixeira, de onde dá pra restaurar ou
// apagar de vez. Só sai quando não tem OP ativa — senão o kanban perderia o
// agrupador das OPs que ainda estão sendo produzidas.
export async function excluirRemessaAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('remessas')

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  const [alvo] = await db
    .select({ id: remessasFull.id })
    .from(remessasFull)
    .where(and(eq(remessasFull.id, id), isNull(remessasFull.deletedAt)))
    .limit(1)
  if (!alvo) return { success: false, error: 'Remessa não encontrada' }

  const [agg] = await db
    .select({ ativas: sql<number>`count(*)::int` })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.remessaFullId, id), opAtiva))

  const ativas = agg?.ativas ?? 0
  if (ativas > 0) {
    return {
      success: false,
      error:
        `Essa remessa tem ${ativas} OP${ativas > 1 ? 's' : ''} ativa${ativas > 1 ? 's' : ''}. ` +
        'Exclua ou cancele essas OPs antes de excluir a remessa.',
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(remessasFull)
      .set({ deletedAt: new Date() })
      .where(and(eq(remessasFull.id, id), isNull(remessasFull.deletedAt)))
  })

  revalidatePath('/remessas')
  revalidatePath('/lixeira')
  return { success: true, message: 'Remessa enviada pra lixeira' }
}

// -----------------------------------------------------------------
// DESPACHADAS — o que já foi embora
// -----------------------------------------------------------------

export type RemessaDespachada = {
  id: string
  canal: 'full_ml' | 'full_shopee'
  dataEnvio: string
  contaNome: string | null
  ops: number
  /** Soma das quantidades das OPs ativas — o que o marketplace pediu. */
  pecasPedidas: number
  /** Soma dos apontamentos das OPs com baixa — o que de fato foi. */
  pecasEnviadas: number
  /** Quando saiu a última baixa. */
  despachadaEm: Date | null
}

// Despachada = sem OP pendente de baixa, com ao menos uma OP ativa, e envio
// de 30 DIAS ATRÁS EM DIANTE. Sem limite pra frente de propósito: um Full
// despachado ANTES da data de envio sai das Abertas e, com "últimos 30 dias"
// ao pé da letra, não apareceria em lugar nenhum.
export async function listarRemessasDespachadas(): Promise<RemessaDespachada[]> {
  await requireArea('remessas')

  const desde = somarDias(hojeEmBrasilia(), -30)
  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      contaNome: contasMarketplace.nome,
      ops: sql<number>`count(*)::int`,
      pendentes: sql<number>`count(*) filter (
        where ${ordensProducao.status} <> 'enviado'
      )::int`,
      pecasPedidas: sql<number>`coalesce(sum(${ordensProducao.quantidade}), 0)::int`,
      // ⚠️ "ordens_producao"."id" QUALIFICADO À MÃO — a subquery é sobre
      // apontamentos_producao, que tem `id` próprio, e sem isso a soma sai 0.
      pecasEnviadas: sql<number>`coalesce(sum(
        CASE WHEN ${ordensProducao.status} = 'enviado' THEN (
          SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)
          FROM ${apontamentosProducao}
          WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
        ) ELSE 0 END
      ), 0)::int`,
      despachadaEm: sql<string | null>`max(${ordensProducao.dataRealFim})`,
    })
    .from(remessasFull)
    .innerJoin(
      ordensProducao,
      and(eq(ordensProducao.remessaFullId, remessasFull.id), opAtiva),
    )
    .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
    .where(
      and(
        isNull(remessasFull.deletedAt),
        sql`${remessasFull.dataEnvio} >= ${desde}`,
      ),
    )
    .groupBy(
      remessasFull.id,
      remessasFull.canal,
      remessasFull.dataEnvio,
      contasMarketplace.nome,
    )
    .orderBy(desc(remessasFull.dataEnvio))

  return rows
    .filter((r) => r.pendentes === 0)
    .map((r) => ({
      id: r.id,
      canal: r.canal as 'full_ml' | 'full_shopee',
      dataEnvio: r.dataEnvio,
      contaNome: r.contaNome ?? null,
      ops: r.ops,
      pecasPedidas: r.pecasPedidas,
      pecasEnviadas: r.pecasEnviadas,
      despachadaEm: r.despachadaEm ? new Date(r.despachadaEm) : null,
    }))
}

// -----------------------------------------------------------------
// DESPACHAR — baixa em tudo o que está pronto, numa transação
// -----------------------------------------------------------------
//
// ⚠️ AS MESMAS REGRAS E OS MESMOS EFEITOS DA BAIXA INDIVIDUAL. Cada OP passa
// por `erroDaTransicaoGenerica` (só a partir de Produção concluída, e com
// apontamento) e é gravada por `gravarBaixa` — a função que o "Dar baixa" do
// painel também usa. O que não passa FICA, e a resposta diz quantas.
//
// Numa transação só: ou o despacho inteiro entra, ou nada entra. Um despacho
// pela metade deixaria o gerente sem saber quais peças já constam como
// enviadas.

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function despacharRemessaAction(
  remessaId: string,
): Promise<ActionResult> {
  const user = await requireAreaEscrita('remessas')
  if (!uuidRe.test(remessaId)) return { success: false, error: 'ID inválido' }

  const [remessa] = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
    })
    .from(remessasFull)
    .where(and(eq(remessasFull.id, remessaId), isNull(remessasFull.deletedAt)))
    .limit(1)
  if (!remessa) return { success: false, error: 'Remessa não encontrada' }

  const ops = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      canalDestino: ordensProducao.canalDestino,
      produtoId: ordensProducao.produtoId,
      variacaoId: ordensProducao.variacaoId,
      dataRealFim: ordensProducao.dataRealFim,
      temApontamento: sql<boolean>`EXISTS (
        SELECT 1 FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
    })
    .from(ordensProducao)
    .where(
      and(
        eq(ordensProducao.remessaFullId, remessaId),
        opAtiva,
        ne(ordensProducao.status, 'enviado'),
      ),
    )

  const vao = ops.filter(
    (o) => erroDaTransicaoGenerica(o.status, 'enviado', o.temApontamento) === null,
  )
  const ficam = ops.length - vao.length
  if (vao.length === 0) {
    return {
      success: false,
      error: 'Nenhuma OP dessa remessa está pronta pra baixa (produção concluída e com apontamento)',
    }
  }

  const rotulo = rotuloDaRemessa(remessa.canal, remessa.dataEnvio)
  const gravadas = await db.transaction(async (tx) => {
    let n = 0
    for (const op of vao) {
      const ok = await gravarBaixa(tx, op, {
        usuarioId: user.id,
        observacao: `Despacho do ${rotulo}`,
      })
      // Alguém mexeu numa OP entre a leitura e agora: o despacho inteiro
      // volta, pra não gravar metade de um envio.
      if (!ok) throw new Error('CONFLITO')
      n++
    }
    return n
  }).catch((e) => {
    if (e instanceof Error && e.message === 'CONFLITO') return -1
    throw e
  })
  if (gravadas === -1) {
    return {
      success: false,
      error: 'Alguém mexeu numa OP dessa remessa agora mesmo. Atualize a tela e despache de novo.',
    }
  }

  revalidatePath('/remessas')
  revalidatePath('/ordens')
  revalidatePath('/producao')
  revalidatePath('/dashboard')
  revalidatePath('/estoque')
  return {
    success: true,
    message:
      `${gravadas} OP${gravadas > 1 ? 's' : ''} com baixa` +
      (ficam > 0 ? ` · ${ficam} ficou${ficam > 1 ? 'ram' : ''} na remessa` : ''),
  }
}

// -----------------------------------------------------------------
// EDITAR — data de envio, conta e "produção até"
// -----------------------------------------------------------------
//
// ⚠️ MUDAR O PRAZO MUDA AS OPs, NA MESMA TRANSAÇÃO. Se a data de envio ou o
// "produção até" mudar, as OPs da remessa ainda sem baixa recebem o prazo
// novo, cada uma com uma linha no histórico ("Prazo da remessa: 27/09 →
// 02/10"). É evento sem transição, que o relógio do aging ignora. Remessa com
// um prazo e OPs com outro é o card "no prazo" com as OPs atrasadas.
//
// Canal e identificador do envio não são editáveis: o índice único
// `remessas_full_envio_uidx` continua valendo como estava.

export type EditarRemessaInput = {
  dataEnvio: string
  contaId: string
  /** null = padrão (envio menos a folga). */
  producaoAte: string | null
}

export async function editarRemessaAction(
  remessaId: string,
  input: EditarRemessaInput,
): Promise<ActionResult> {
  const user = await requireAreaEscrita('remessas')
  if (!uuidRe.test(remessaId)) return { success: false, error: 'ID inválido' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataEnvio ?? '')) {
    return { success: false, error: 'Data de envio inválida' }
  }
  if (!uuidRe.test(input.contaId ?? '')) {
    return { success: false, error: 'Escolha a conta do envio' }
  }
  const producaoAte = input.producaoAte || null
  const erroPrazo = erroDoProducaoAte(input.dataEnvio, producaoAte)
  if (erroPrazo) return { success: false, error: erroPrazo }

  const [atual] = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      producaoAte: remessasFull.producaoAte,
    })
    .from(remessasFull)
    .where(and(eq(remessasFull.id, remessaId), isNull(remessasFull.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Remessa não encontrada' }

  // A conta tem que ser do MESMO canal e estar ativa — a lista da tela já vem
  // filtrada, mas isso é conferência, não garantia.
  const [conta] = await db
    .select({ id: contasMarketplace.id })
    .from(contasMarketplace)
    .where(
      and(
        eq(contasMarketplace.id, input.contaId),
        eq(contasMarketplace.canal, atual.canal),
        eq(contasMarketplace.ativo, true),
        isNull(contasMarketplace.deletedAt),
      ),
    )
    .limit(1)
  if (!conta) {
    return { success: false, error: 'Conta inválida — escolha uma conta ativa do canal' }
  }

  const prazoAntes = producaoAteEfetivo(atual)
  const prazoDepois = producaoAteEfetivo({ dataEnvio: input.dataEnvio, producaoAte })

  const recalculadas = await db.transaction(async (tx) => {
    await tx
      .update(remessasFull)
      .set({ dataEnvio: input.dataEnvio, contaId: conta.id, producaoAte })
      .where(eq(remessasFull.id, remessaId))

    if (prazoAntes === prazoDepois) return 0

    const alvo = await tx
      .update(ordensProducao)
      .set({ dataPrevistaFim: prazoDaOp(prazoDepois) })
      .where(
        and(
          eq(ordensProducao.remessaFullId, remessaId),
          opAtiva,
          ne(ordensProducao.status, 'enviado'),
        ),
      )
      .returning({ id: ordensProducao.id, status: ordensProducao.status })

    if (alvo.length > 0) {
      await tx.insert(eventosKanban).values(
        alvo.map((o) => ({
          ordemId: o.id,
          statusAnterior: o.status,
          statusNovo: o.status,
          usuarioId: user.id,
          observacao: `Prazo da remessa: ${diaMes(prazoAntes)} → ${diaMes(prazoDepois)}`,
        })),
      )
    }
    return alvo.length
  })

  revalidatePath('/remessas')
  revalidatePath('/ordens')
  revalidatePath('/producao')
  revalidatePath('/dashboard')
  return {
    success: true,
    message:
      recalculadas > 0
        ? `Remessa atualizada · prazo de ${recalculadas} OP${recalculadas > 1 ? 's' : ''} recalculado`
        : 'Remessa atualizada',
  }
}
