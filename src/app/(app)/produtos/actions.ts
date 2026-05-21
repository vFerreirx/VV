'use server'

import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  produtos,
  variacoesProduto,
  type Produto,
  type VariacaoProduto,
} from '@/lib/db/schema'
import {
  produtoSchema,
  produtosFiltrosSchema,
  type ProdutoInput,
  type ProdutosFiltros,
} from '@/lib/validators/produtos'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem com filtros
// -----------------------------------------------------------------

export type ProdutoListItem = Produto & { totalVariacoes: number }

export async function listarProdutos(
  filtros: ProdutosFiltros = {},
): Promise<ProdutoListItem[]> {
  const parsed = produtosFiltrosSchema.safeParse(filtros)
  const { q, ativo } = parsed.success ? parsed.data : {}

  const conditions = [isNull(produtos.deletedAt)]
  if (q && q.length > 0) {
    conditions.push(
      or(
        ilike(produtos.sku, `%${q}%`),
        ilike(produtos.nome, `%${q}%`),
      )!,
    )
  }
  if (ativo === 'true') conditions.push(eq(produtos.ativo, true))
  else if (ativo === 'false') conditions.push(eq(produtos.ativo, false))

  // Conta variações via subquery agregada — evita N+1.
  const totalVariacoesSql = sql<number>`(
    SELECT COUNT(*)::int
    FROM ${variacoesProduto}
    WHERE ${variacoesProduto.produtoId} = ${produtos.id}
  )`.as('total_variacoes')

  const rows = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      nome: produtos.nome,
      descricao: produtos.descricao,
      gramatura: produtos.gramatura,
      larguraCm: produtos.larguraCm,
      rendimentoKgPorMetro: produtos.rendimentoKgPorMetro,
      mlbId: produtos.mlbId,
      shopeeItemId: produtos.shopeeItemId,
      ativo: produtos.ativo,
      createdAt: produtos.createdAt,
      updatedAt: produtos.updatedAt,
      deletedAt: produtos.deletedAt,
      totalVariacoes: totalVariacoesSql,
    })
    .from(produtos)
    .where(and(...conditions))
    .orderBy(desc(produtos.ativo), asc(produtos.sku))

  return rows
}

// -----------------------------------------------------------------
// Buscar por id (com variações)
// -----------------------------------------------------------------

export type ProdutoComVariacoes = Produto & { variacoes: VariacaoProduto[] }

export async function obterProduto(
  id: string,
): Promise<ProdutoComVariacoes | null> {
  const [produto] = await db
    .select()
    .from(produtos)
    .where(and(eq(produtos.id, id), isNull(produtos.deletedAt)))
    .limit(1)

  if (!produto) return null

  const variacoes = await db
    .select()
    .from(variacoesProduto)
    .where(eq(variacoesProduto.produtoId, id))
    .orderBy(asc(variacoesProduto.skuVariacao))

  return { ...produto, variacoes }
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarProdutoAction(
  input: ProdutoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = produtoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // SKU único — checa antes pra dar mensagem amigável.
  const existing = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(eq(produtos.sku, data.sku))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe um produto com SKU "${data.sku}"` }
  }

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(produtos)
      .values({
        sku: data.sku,
        nome: data.nome,
        descricao: data.descricao ?? null,
        gramatura: data.gramatura,
        larguraCm: data.larguraCm,
        rendimentoKgPorMetro: data.rendimentoKgPorMetro,
        ativo: data.ativo,
      })
      .returning({ id: produtos.id })

    if (data.variacoes.length > 0) {
      await tx.insert(variacoesProduto).values(
        data.variacoes.map((v) => ({
          produtoId: inserted!.id,
          skuVariacao: v.skuVariacao,
          cor: v.cor ?? null,
          modelo: v.modelo ?? null,
          tamanho: v.tamanho ?? null,
          precoAdicional: v.precoAdicional ?? '0',
        })),
      )
    }

    return inserted!.id
  })

  revalidatePath('/produtos')
  return {
    success: true,
    data: { id: novoId },
    message: 'Produto criado',
  }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarProdutoAction(
  id: string,
  input: ProdutoInput,
): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = produtoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // Garante que o produto existe e não está deletado.
  const [atual] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.id, id), isNull(produtos.deletedAt)))
    .limit(1)

  if (!atual) {
    return { success: false, error: 'Produto não encontrado' }
  }

  // SKU único entre OUTROS produtos.
  const conflicting = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.sku, data.sku), isNull(produtos.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return { success: false, error: `Já existe outro produto com SKU "${data.sku}"` }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(produtos)
      .set({
        sku: data.sku,
        nome: data.nome,
        descricao: data.descricao ?? null,
        gramatura: data.gramatura,
        larguraCm: data.larguraCm,
        rendimentoKgPorMetro: data.rendimentoKgPorMetro,
        ativo: data.ativo,
      })
      .where(eq(produtos.id, id))

    // Estratégia de variações: pega as existentes, compara com o input.
    // - id no input + presente: UPDATE
    // - id no input + ausente do input: DELETE
    // - sem id: INSERT
    const existentes = await tx
      .select({ id: variacoesProduto.id })
      .from(variacoesProduto)
      .where(eq(variacoesProduto.produtoId, id))
    const existIds = new Set(existentes.map((e) => e.id))
    const inputIds = new Set(
      data.variacoes.map((v) => v.id).filter((x): x is string => Boolean(x)),
    )

    // DELETE: existem no banco mas não no input
    const toDelete = [...existIds].filter((eid) => !inputIds.has(eid))
    for (const did of toDelete) {
      await tx.delete(variacoesProduto).where(eq(variacoesProduto.id, did))
    }

    // UPDATE / INSERT
    for (const v of data.variacoes) {
      if (v.id && existIds.has(v.id)) {
        await tx
          .update(variacoesProduto)
          .set({
            skuVariacao: v.skuVariacao,
            cor: v.cor ?? null,
            modelo: v.modelo ?? null,
            tamanho: v.tamanho ?? null,
            precoAdicional: v.precoAdicional ?? '0',
          })
          .where(eq(variacoesProduto.id, v.id))
      } else {
        await tx.insert(variacoesProduto).values({
          produtoId: id,
          skuVariacao: v.skuVariacao,
          cor: v.cor ?? null,
          modelo: v.modelo ?? null,
          tamanho: v.tamanho ?? null,
          precoAdicional: v.precoAdicional ?? '0',
        })
      }
    }
  })

  revalidatePath('/produtos')
  revalidatePath(`/produtos/${id}`)
  return { success: true, message: 'Produto atualizado' }
}

// -----------------------------------------------------------------
// Soft delete
// -----------------------------------------------------------------

export async function excluirProdutoAction(id: string): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const [atual] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.id, id), isNull(produtos.deletedAt)))
    .limit(1)

  if (!atual) {
    return { success: false, error: 'Produto não encontrado' }
  }

  await db
    .update(produtos)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(produtos.id, id))

  revalidatePath('/produtos')
  return { success: true, message: 'Produto excluído' }
}
