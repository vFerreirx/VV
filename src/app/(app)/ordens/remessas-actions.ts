'use server'

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { erroDeProdutoDeParceiro } from '@/lib/db/origem-do-produto'
import { hojeEmBrasilia } from '@/lib/dia-brasil'
import {
  contasMarketplace,
  eventosKanban,
  ordensProducao,
  remessasFull,
  variacoesProduto,
} from '@/lib/db/schema'
import {
  erroDaRemessaDaOp,
  prazoDaOp,
  producaoAteEfetivo,
  rotuloDaRemessa,
} from '@/lib/producao/prazo-da-remessa'
import {
  criarOpsFullSchema,
  type CriarOpsFullInput,
} from '@/lib/validators/remessas'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export type RemessaFullOpcao = {
  id: string
  canal: 'full_ml' | 'full_shopee'
  dataEnvio: string
  /** Prazo da produção escolhido; nulo = o padrão (envio menos a folga). */
  producaoAte: string | null
  contaNome: string | null
  /** "Full Shopee · Conta 5 · 30/09" — `rotuloDaRemessa`, igual em todo lugar. */
  rotulo: string
  ops: number
}

// Fulls recentes (não excluídos), com contagem de OPs — pro filtro, pro
// dialog de "cadastrar dentro de um Full existente" e pra Nova OP de Full.
export async function listarRemessasFull(): Promise<RemessaFullOpcao[]> {
  await requireArea('ordens')
  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      producaoAte: remessasFull.producaoAte,
      contaNome: contasMarketplace.nome,
      // Qualifica "remessas_full"."id" — sem isso o Postgres correlaciona
      // com o `id` da própria subquery (ordens_producao) e o count nunca
      // bate (sempre 0).
      ops: sql<number>`(
        SELECT COUNT(*)::int FROM ${ordensProducao}
        WHERE ${ordensProducao.remessaFullId} = "remessas_full"."id"
          AND ${ordensProducao.deletedAt} IS NULL
      )`,
    })
    .from(remessasFull)
    .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
    .where(isNull(remessasFull.deletedAt))
    .orderBy(desc(remessasFull.dataEnvio))
    .limit(30)

  return rows.map((r) => ({
    id: r.id,
    canal: r.canal as 'full_ml' | 'full_shopee',
    dataEnvio: r.dataEnvio,
    producaoAte: r.producaoAte,
    contaNome: r.contaNome ?? null,
    rotulo: rotuloDaRemessa(r.canal, r.dataEnvio, r.contaNome),
    ops: r.ops,
  }))
}

// -----------------------------------------------------------------
// A REMESSA DA NOVA OP DE FULL
// -----------------------------------------------------------------
//
// OP de Full só nasce dentro de uma remessa (`erroDaRemessaDaOp`). A Nova OP
// oferece as remessas DAQUELE canal com envio de hoje em diante — a mesma
// janela do "Mudar destino" da ficha (`listarDestinosDaOrdem`) — ou cria uma
// na hora, com uma CONTA do canal e a DATA DE ENVIO.

export type OpcoesDeRemessaDaNovaOp = {
  remessas: { id: string; rotulo: string; producaoAte: string }[]
  contas: { id: string; nome: string }[]
}

export async function opcoesDeRemessaParaNovaOp(
  canal: string,
): Promise<OpcoesDeRemessaDaNovaOp> {
  await requireArea('ordens')
  if (canal !== 'full_ml' && canal !== 'full_shopee') {
    return { remessas: [], contas: [] }
  }
  const [remessas, contas] = await Promise.all([
    db
      .select({
        id: remessasFull.id,
        canal: remessasFull.canal,
        dataEnvio: remessasFull.dataEnvio,
        producaoAte: remessasFull.producaoAte,
        contaNome: contasMarketplace.nome,
      })
      .from(remessasFull)
      .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
      .where(
        and(
          isNull(remessasFull.deletedAt),
          eq(remessasFull.canal, canal),
          sql`${remessasFull.dataEnvio} >= ${hojeEmBrasilia()}`,
        ),
      )
      .orderBy(asc(remessasFull.dataEnvio)),
    db
      .select({ id: contasMarketplace.id, nome: contasMarketplace.nome })
      .from(contasMarketplace)
      .where(
        and(
          eq(contasMarketplace.canal, canal),
          eq(contasMarketplace.ativo, true),
          isNull(contasMarketplace.deletedAt),
        ),
      )
      .orderBy(asc(contasMarketplace.nome)),
  ])
  return {
    remessas: remessas.map((r) => ({
      id: r.id,
      rotulo: rotuloDaRemessa(r.canal, r.dataEnvio, r.contaNome),
      producaoAte: producaoAteEfetivo(r),
    })),
    contas,
  }
}

// Cria as OPs dentro de um Full (novo ou existente). Cada item vira uma
// OP programada com o canal do Full e o PRAZO DA PRODUÇÃO da remessa — não a
// data de envio (src/lib/producao/prazo-da-remessa.ts).
export async function criarOpsFullAction(
  input: CriarOpsFullInput,
): Promise<ActionResult<{ ops: number }>> {
  const user = await requireAreaEscrita('ordens')
  const parsed = criarOpsFullSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // Resolve o produto de cada variação escolhida.
  const variacaoIds = [...new Set(data.itens.map((i) => i.variacaoId))]
  const vars = await db
    .select({ id: variacoesProduto.id, produtoId: variacoesProduto.produtoId })
    .from(variacoesProduto)
    .where(inArray(variacoesProduto.id, variacaoIds))
  const produtoDaVariacao = new Map(vars.map((v) => [v.id, v.produtoId]))
  for (const it of data.itens) {
    if (!produtoDaVariacao.has(it.variacaoId)) {
      return { success: false, error: 'Variação não encontrada' }
    }
  }
  // Produto de parceiro não vira OP (src/lib/db/origem-do-produto.ts).
  const erroOrigem = await erroDeProdutoDeParceiro([...produtoDaVariacao.values()])
  if (erroOrigem) return { success: false, error: erroOrigem }

  const criadas = await db.transaction(async (tx) => {
    // Full existente ou novo.
    let remessa: {
      id: string
      canal: string
      dataEnvio: string
      producaoAte: string | null
    }
    // A conta entra no rótulo gravado no histórico das OPs.
    let contaNome: string | null = null
    if (data.remessaId) {
      const [r] = await tx
        .select({
          id: remessasFull.id,
          canal: remessasFull.canal,
          dataEnvio: remessasFull.dataEnvio,
          producaoAte: remessasFull.producaoAte,
          contaNome: contasMarketplace.nome,
        })
        .from(remessasFull)
        .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
        .where(
          and(eq(remessasFull.id, data.remessaId), isNull(remessasFull.deletedAt)),
        )
        .limit(1)
      if (!r) throw new Error('FULL_NAO_ENCONTRADO')
      remessa = r
      contaNome = r.contaNome ?? null
    } else {
      // A conta tem que ser do MESMO canal do Full e estar ativa — a trava
      // da tela (o seletor já vem filtrado) não é garantia de nada.
      const [conta] = await tx
        .select({ id: contasMarketplace.id, nome: contasMarketplace.nome })
        .from(contasMarketplace)
        .where(
          and(
            eq(contasMarketplace.id, data.contaId!),
            eq(contasMarketplace.canal, data.canal!),
            eq(contasMarketplace.ativo, true),
            isNull(contasMarketplace.deletedAt),
          ),
        )
        .limit(1)
      if (!conta) throw new Error('CONTA_INVALIDA')
      contaNome = conta.nome

      const [r] = await tx
        .insert(remessasFull)
        .values({
          canal: data.canal!,
          dataEnvio: data.dataEnvio!,
          // Nulo = padrão. O schema já recusou o que fura a folga.
          producaoAte: data.producaoAte ?? null,
          contaId: conta.id,
        })
        .returning({
          id: remessasFull.id,
          canal: remessasFull.canal,
          dataEnvio: remessasFull.dataEnvio,
          producaoAte: remessasFull.producaoAte,
        })
      remessa = r!
    }

    // O prazo da PRODUÇÃO vira o prazo da OP (fim do dia, horário do
    // Brasil) — o da remessa nova ou o da existente, que é o que faz a OP
    // cadastrada depois herdar o prazo de quem já estava lá.
    const prazo = prazoDaOp(producaoAteEfetivo(remessa))
    const rotulo = rotuloDaRemessa(remessa.canal, remessa.dataEnvio, contaNome)
    // O guarda único: toda OP daqui nasce na remessa, com o canal DELA.
    if (erroDaRemessaDaOp(remessa.canal, remessa)) {
      throw new Error('FULL_NAO_ENCONTRADO')
    }

    for (const it of data.itens) {
      const [op] = await tx
        .insert(ordensProducao)
        .values({
          numero: '',
          produtoId: produtoDaVariacao.get(it.variacaoId)!,
          variacaoId: it.variacaoId,
          quantidade: it.quantidade,
          canalDestino: remessa.canal as 'full_ml' | 'full_shopee',
          prioridade: data.prioridade,
          status: 'programado',
          dataPrevistaFim: prazo,
          remessaFullId: remessa.id,
          criadoPor: user.id,
          observacoes: `Remessa ${rotulo}`,
        })
        .returning({ id: ordensProducao.id })

      await tx.insert(eventosKanban).values({
        ordemId: op!.id,
        statusAnterior: null,
        statusNovo: 'programado',
        usuarioId: user.id,
        observacao: `OP criada no Full ${rotulo}`,
      })
    }
    return data.itens.length
  }).catch((e) => {
    if (e instanceof Error && e.message === 'FULL_NAO_ENCONTRADO') return -1
    if (e instanceof Error && e.message === 'CONTA_INVALIDA') return -2
    throw e
  })

  if (criadas === -1) return { success: false, error: 'Full não encontrado' }
  if (criadas === -2) {
    return {
      success: false,
      error: 'Conta de marketplace inválida — escolha uma conta ativa do canal',
    }
  }

  revalidatePath('/ordens')
  revalidatePath('/producao')
  return {
    success: true,
    data: { ops: criadas },
    message: `${criadas} OP${criadas > 1 ? 's' : ''} criada${criadas > 1 ? 's' : ''} no Full`,
  }
}
