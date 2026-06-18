'use server'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { produtos, users, variacoesProduto, vendas } from '@/lib/db/schema'
import { vendaSchema, type VendaInput } from '@/lib/validators/vendas'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// -----------------------------------------------------------------
// Listar vendas de um dia
// -----------------------------------------------------------------

export type VendaItem = {
  id: string
  produtoNome: string
  produtoSku: string
  variacaoLabel: string | null
  quantidade: number
  canal: 'full_ml' | 'full_shopee' | 'venda_direta'
  observacao: string | null
  usuarioNome: string | null
}

export async function listarVendasDoDia(data: string): Promise<VendaItem[]> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])

  const rows = await db
    .select({
      id: vendas.id,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      cor: variacoesProduto.cor,
      modelo: variacoesProduto.modelo,
      tamanho: variacoesProduto.tamanho,
      skuVariacao: variacoesProduto.skuVariacao,
      quantidade: vendas.quantidade,
      canal: vendas.canal,
      observacao: vendas.observacao,
      usuarioNome: users.nome,
    })
    .from(vendas)
    .innerJoin(produtos, eq(produtos.id, vendas.produtoId))
    .leftJoin(variacoesProduto, eq(variacoesProduto.id, vendas.variacaoId))
    .leftJoin(users, eq(users.id, vendas.usuarioId))
    .where(and(eq(vendas.data, data), isNull(vendas.deletedAt)))
    .orderBy(desc(vendas.createdAt))

  return rows.map((r) => ({
    id: r.id,
    produtoNome: r.produtoNome,
    produtoSku: r.produtoSku,
    variacaoLabel:
      [r.cor, r.modelo, r.tamanho].filter(Boolean).join(' / ') ||
      r.skuVariacao ||
      null,
    quantidade: r.quantidade,
    canal: (r.canal === 'full_shopee'
      ? 'full_shopee'
      : r.canal === 'venda_direta'
        ? 'venda_direta'
        : 'full_ml') as 'full_ml' | 'full_shopee' | 'venda_direta',
    observacao: r.observacao ?? null,
    usuarioNome: r.usuarioNome ?? null,
  }))
}

// -----------------------------------------------------------------
// Criar / excluir venda
// -----------------------------------------------------------------

export async function criarVendaAction(
  input: VendaInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(['admin', 'gerente_producao', 'vendas'])

  const parsed = vendaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [inserted] = await db
    .insert(vendas)
    .values({
      produtoId: data.produtoId,
      variacaoId: data.variacaoId ?? null,
      quantidade: data.quantidade,
      canal: data.canal,
      data: data.data,
      observacao: data.observacao ?? null,
      usuarioId: user.id,
    })
    .returning({ id: vendas.id })

  revalidatePath('/vendas')
  return { success: true, data: { id: inserted!.id }, message: 'Venda registrada' }
}

export async function excluirVendaAction(id: string): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  await db
    .update(vendas)
    .set({ deletedAt: new Date() })
    .where(and(eq(vendas.id, id), isNull(vendas.deletedAt)))

  revalidatePath('/vendas')
  return { success: true, message: 'Venda removida' }
}
