'use server'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAuth, requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { tamanhos, type Tamanho } from '@/lib/db/schema'
import { tamanhoSchema, type TamanhoInput } from '@/lib/validators/tamanhos'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export async function listarTamanhos(): Promise<Tamanho[]> {
  await requireAuth()
  return db
    .select()
    .from(tamanhos)
    .where(isNull(tamanhos.deletedAt))
    .orderBy(asc(tamanhos.ordem), asc(tamanhos.nome))
}

export async function listarTamanhosAtivos(): Promise<Tamanho[]> {
  await requireAuth()
  return db
    .select()
    .from(tamanhos)
    .where(and(isNull(tamanhos.deletedAt), eq(tamanhos.ativo, true)))
    .orderBy(asc(tamanhos.ordem), asc(tamanhos.nome))
}

export async function criarTamanhoAction(
  input: TamanhoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = tamanhoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const existing = await db
    .select({ id: tamanhos.id })
    .from(tamanhos)
    .where(and(eq(tamanhos.nome, data.nome), isNull(tamanhos.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe um tamanho "${data.nome}"` }
  }

  const [inserted] = await db
    .insert(tamanhos)
    .values({
      nome: data.nome,
      ordem: data.ordem,
      ativo: data.ativo,
    })
    .returning({ id: tamanhos.id })

  revalidatePath('/tamanhos')
  return {
    success: true,
    data: { id: inserted!.id },
    message: 'Tamanho cadastrado',
  }
}

export async function atualizarTamanhoAction(
  id: string,
  input: TamanhoInput,
): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = tamanhoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: tamanhos.id })
    .from(tamanhos)
    .where(and(eq(tamanhos.id, id), isNull(tamanhos.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Tamanho não encontrado' }
  }

  const conflicting = await db
    .select({ id: tamanhos.id })
    .from(tamanhos)
    .where(and(eq(tamanhos.nome, data.nome), isNull(tamanhos.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return { success: false, error: `Já existe outro tamanho "${data.nome}"` }
  }

  await db
    .update(tamanhos)
    .set({
      nome: data.nome,
      ordem: data.ordem,
      ativo: data.ativo,
    })
    .where(eq(tamanhos.id, id))

  revalidatePath('/tamanhos')
  return { success: true, message: 'Tamanho atualizado' }
}

export async function excluirTamanhoAction(id: string): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const [atual] = await db
    .select({ id: tamanhos.id })
    .from(tamanhos)
    .where(and(eq(tamanhos.id, id), isNull(tamanhos.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Tamanho não encontrado' }
  }

  await db
    .update(tamanhos)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(tamanhos.id, id))

  revalidatePath('/tamanhos')
  return { success: true, message: 'Tamanho excluído' }
}
