'use server'

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  orcamentoItens,
  orcamentos,
  type Orcamento,
  type OrcamentoItem,
} from '@/lib/db/schema'
import {
  orcamentoSchema,
  type OrcamentoInput,
} from '@/lib/validators/orcamentos'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Leitura
// -----------------------------------------------------------------

export type OrcamentoListItem = Orcamento & {
  itensCount: number
  total: number
}

export type OrcamentoComItens = Orcamento & {
  itens: OrcamentoItem[]
  total: number
}

export async function listarOrcamentos(): Promise<OrcamentoListItem[]> {
  await requireArea('vendas')
  const rows = await db
    .select()
    .from(orcamentos)
    .where(isNull(orcamentos.deletedAt))
    .orderBy(desc(orcamentos.numero))

  if (rows.length === 0) return []

  const ids = rows.map((o) => o.id)
  const agg = await db
    .select({
      orcamentoId: orcamentoItens.orcamentoId,
      itens: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${orcamentoItens.quantidade} * ${orcamentoItens.precoUnitario}), 0)`,
    })
    .from(orcamentoItens)
    .where(inArray(orcamentoItens.orcamentoId, ids))
    .groupBy(orcamentoItens.orcamentoId)
  const m = new Map(agg.map((a) => [a.orcamentoId, a]))

  return rows.map((o) => ({
    ...o,
    itensCount: m.get(o.id)?.itens ?? 0,
    total: Number(m.get(o.id)?.total ?? 0),
  }))
}

export async function obterOrcamento(
  id: string,
): Promise<OrcamentoComItens | null> {
  await requireArea('vendas')
  const [o] = await db
    .select()
    .from(orcamentos)
    .where(and(eq(orcamentos.id, id), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!o) return null

  const itens = await db
    .select()
    .from(orcamentoItens)
    .where(eq(orcamentoItens.orcamentoId, id))
    .orderBy(asc(orcamentoItens.createdAt))

  const total = itens.reduce(
    (s, it) => s + it.quantidade * Number(it.precoUnitario),
    0,
  )
  return { ...o, itens, total }
}

// Último preço usado por descrição (em qualquer orçamento não excluído).
// Serve pra pré-preencher o preço ao puxar produto/kit do catálogo.
export async function listarPrecosRecentes(): Promise<
  Record<string, string>
> {
  await requireArea('vendas')
  const rows = await db
    .select({
      descricao: orcamentoItens.descricao,
      preco: orcamentoItens.precoUnitario,
    })
    .from(orcamentoItens)
    .innerJoin(orcamentos, eq(orcamentos.id, orcamentoItens.orcamentoId))
    .where(isNull(orcamentos.deletedAt))
    .orderBy(desc(orcamentoItens.createdAt))
    .limit(500)

  // Mais recente vence (a lista vem desc, então o primeiro fica).
  const mapa: Record<string, string> = {}
  for (const r of rows) {
    if (!(r.descricao in mapa)) mapa[r.descricao] = r.preco
  }
  return mapa
}

// -----------------------------------------------------------------
// Criar / atualizar / excluir
// -----------------------------------------------------------------

export async function criarOrcamentoAction(
  input: OrcamentoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('vendas')
  const parsed = orcamentoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(orcamentos)
      .values({ cliente: data.cliente, observacao: data.observacao ?? null })
      .returning({ id: orcamentos.id })

    await tx.insert(orcamentoItens).values(
      data.itens.map((it) => ({
        orcamentoId: inserted!.id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        precoUnitario: it.precoUnitario,
      })),
    )
    return inserted!.id
  })

  revalidatePath('/orcamentos')
  return { success: true, data: { id: novoId }, message: 'Orçamento criado' }
}

export async function atualizarOrcamentoAction(
  id: string,
  input: OrcamentoInput,
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')
  const parsed = orcamentoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: orcamentos.id })
    .from(orcamentos)
    .where(and(eq(orcamentos.id, id), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Orçamento não encontrado' }

  await db.transaction(async (tx) => {
    await tx
      .update(orcamentos)
      .set({ cliente: data.cliente, observacao: data.observacao ?? null })
      .where(eq(orcamentos.id, id))

    // Substitui os itens (simples e seguro, igual aos kits).
    await tx.delete(orcamentoItens).where(eq(orcamentoItens.orcamentoId, id))
    await tx.insert(orcamentoItens).values(
      data.itens.map((it) => ({
        orcamentoId: id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        precoUnitario: it.precoUnitario,
      })),
    )
  })

  revalidatePath('/orcamentos')
  revalidatePath(`/orcamentos/${id}`)
  return { success: true, message: 'Orçamento atualizado' }
}

export async function excluirOrcamentoAction(
  id: string,
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')
  const [atual] = await db
    .select({ id: orcamentos.id })
    .from(orcamentos)
    .where(and(eq(orcamentos.id, id), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Orçamento não encontrado' }

  await db
    .update(orcamentos)
    .set({ deletedAt: new Date() })
    .where(eq(orcamentos.id, id))

  revalidatePath('/orcamentos')
  return { success: true, message: 'Orçamento excluído' }
}
