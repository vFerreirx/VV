'use server'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { vendas } from '@/lib/db/schema'
import { vendaDiaSchema, type VendaDiaInput } from '@/lib/validators/vendas'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type VendaDia = {
  id: string
  data: string
  quantidade: number
  faturamento: string | null
  observacao: string | null
}

// -----------------------------------------------------------------
// Venda de um dia específico
// -----------------------------------------------------------------

export async function obterVendaDoDia(data: string): Promise<VendaDia | null> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])
  const [row] = await db
    .select({
      id: vendas.id,
      data: vendas.data,
      quantidade: vendas.quantidade,
      faturamento: vendas.faturamento,
      observacao: vendas.observacao,
    })
    .from(vendas)
    .where(and(eq(vendas.data, data), isNull(vendas.deletedAt)))
    .limit(1)
  return row ?? null
}

// Últimos N dias com venda registrada (pra lista de referência).
export async function listarVendasRecentes(limit = 14): Promise<VendaDia[]> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])
  return db
    .select({
      id: vendas.id,
      data: vendas.data,
      quantidade: vendas.quantidade,
      faturamento: vendas.faturamento,
      observacao: vendas.observacao,
    })
    .from(vendas)
    .where(isNull(vendas.deletedAt))
    .orderBy(desc(vendas.data))
    .limit(limit)
}

// -----------------------------------------------------------------
// Salvar (upsert por dia) / excluir
// -----------------------------------------------------------------

export async function salvarVendaDiaAction(
  input: VendaDiaInput,
): Promise<ActionResult> {
  const user = await requireRole(['admin', 'gerente_producao', 'vendas'])

  const parsed = vendaDiaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const d = parsed.data

  const [existente] = await db
    .select({ id: vendas.id })
    .from(vendas)
    .where(and(eq(vendas.data, d.data), isNull(vendas.deletedAt)))
    .limit(1)

  if (existente) {
    await db
      .update(vendas)
      .set({
        quantidade: d.quantidade,
        faturamento: d.faturamento ?? null,
        observacao: d.observacao ?? null,
        usuarioId: user.id,
      })
      .where(eq(vendas.id, existente.id))
  } else {
    await db.insert(vendas).values({
      data: d.data,
      quantidade: d.quantidade,
      faturamento: d.faturamento ?? null,
      observacao: d.observacao ?? null,
      usuarioId: user.id,
    })
  }

  revalidatePath('/vendas')
  return { success: true, message: 'Vendas do dia salvas' }
}

export async function excluirVendaDiaAction(
  id: string,
): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  await db
    .update(vendas)
    .set({ deletedAt: new Date() })
    .where(and(eq(vendas.id, id), isNull(vendas.deletedAt)))

  revalidatePath('/vendas')
  return { success: true, message: 'Registro removido' }
}
