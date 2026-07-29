'use server'

import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  movimentacoesEstoque,
  produtos,
  users,
  variacoesProduto,
} from '@/lib/db/schema'
import {
  movimentacaoEstoqueSchema,
  type MovimentacaoEstoqueInput,
} from '@/lib/validators/estoque'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Saldo por variação (= soma das movimentações)
// -----------------------------------------------------------------

export type EstoqueItem = {
  variacaoId: string
  produtoId: string
  produtoNome: string
  produtoSku: string
  skuVariacao: string
  cor: string | null
  modelo: string | null
  tamanho: string | null
  saldo: number
}

export async function listarEstoque(q?: string): Promise<EstoqueItem[]> {
  await requireAuth()

  const conditions = [
    isNull(variacoesProduto.deletedAt),
    isNull(produtos.deletedAt),
  ]
  const termo = q?.trim()
  if (termo && termo.length > 0) {
    conditions.push(
      or(
        ilike(produtos.nome, `%${termo}%`),
        ilike(produtos.sku, `%${termo}%`),
        ilike(variacoesProduto.skuVariacao, `%${termo}%`),
        ilike(variacoesProduto.cor, `%${termo}%`),
      )!,
    )
  }

  // Nota: qualificar com "variacoes_produto"."id" explicitamente — interpolar
  // ${variacoesProduto.id} aqui (via tag `sql`) gera só o identificador da
  // coluna sem qualificar, e como movimentacoes_estoque também tem uma
  // coluna `id`, o Postgres resolvia pro escopo mais interno (a subquery)
  // em vez de correlacionar com a tabela externa — saldo sempre dava 0.
  const saldoSql = sql<number>`(
    SELECT COALESCE(SUM(${movimentacoesEstoque.quantidade}), 0)::int
    FROM ${movimentacoesEstoque}
    WHERE ${movimentacoesEstoque.variacaoId} = "variacoes_produto"."id"
  )`

  const rows = await db
    .select({
      variacaoId: variacoesProduto.id,
      produtoId: produtos.id,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      skuVariacao: variacoesProduto.skuVariacao,
      cor: variacoesProduto.cor,
      modelo: variacoesProduto.modelo,
      tamanho: variacoesProduto.tamanho,
      saldo: saldoSql,
    })
    .from(variacoesProduto)
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(and(...conditions))
    .orderBy(asc(produtos.sku), asc(variacoesProduto.skuVariacao))

  return rows.map((r) => ({
    variacaoId: r.variacaoId,
    produtoId: r.produtoId,
    produtoNome: r.produtoNome,
    produtoSku: r.produtoSku,
    skuVariacao: r.skuVariacao,
    cor: r.cor ?? null,
    modelo: r.modelo ?? null,
    tamanho: r.tamanho ?? null,
    saldo: r.saldo ?? 0,
  }))
}

// -----------------------------------------------------------------
// Histórico de movimentações de uma variação
// -----------------------------------------------------------------

export type MovimentacaoItem = {
  id: string
  tipo: string
  quantidade: number
  observacao: string | null
  usuarioNome: string | null
  em: Date
}

export async function listarMovimentacoes(
  variacaoId: string,
): Promise<MovimentacaoItem[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: movimentacoesEstoque.id,
      tipo: movimentacoesEstoque.tipo,
      quantidade: movimentacoesEstoque.quantidade,
      observacao: movimentacoesEstoque.observacao,
      usuarioNome: users.nome,
      em: movimentacoesEstoque.createdAt,
    })
    .from(movimentacoesEstoque)
    .leftJoin(users, eq(users.id, movimentacoesEstoque.usuarioId))
    .where(eq(movimentacoesEstoque.variacaoId, variacaoId))
    .orderBy(desc(movimentacoesEstoque.createdAt))
    .limit(30)

  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    quantidade: r.quantidade,
    observacao: r.observacao ?? null,
    usuarioNome: r.usuarioNome ?? null,
    em: r.em,
  }))
}

// -----------------------------------------------------------------
// Movimentar (entrada/saída manual = ajuste assinado)
// -----------------------------------------------------------------

export async function movimentarEstoqueAction(
  input: MovimentacaoEstoqueInput,
): Promise<ActionResult> {
  const user = await requireAreaEscrita('estoque')

  const parsed = movimentacaoEstoqueSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data
  const assinada =
    data.sentido === 'entrada' ? data.quantidade : -data.quantidade

  await db.insert(movimentacoesEstoque).values({
    produtoId: data.produtoId,
    variacaoId: data.variacaoId,
    tipo: 'ajuste',
    quantidade: assinada,
    referenciaTipo: 'manual',
    usuarioId: user.id,
    observacao: data.observacao ?? null,
  })

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  return {
    success: true,
    message: data.sentido === 'entrada' ? 'Entrada registrada' : 'Saída registrada',
  }
}
