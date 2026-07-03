'use server'

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { cores, type Cor } from '@/lib/db/schema'
import { corSchema, type CorInput } from '@/lib/validators/cores'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarCores(): Promise<Cor[]> {
  await requireAuth()
  return db
    .select()
    .from(cores)
    .where(isNull(cores.deletedAt))
    .orderBy(asc(cores.nome))
}

// Listagem só de cores ativas — usado em selects de cadastro de produto.
export async function listarCoresAtivas(): Promise<Cor[]> {
  await requireAuth()
  return db
    .select()
    .from(cores)
    .where(and(isNull(cores.deletedAt), eq(cores.ativo, true)))
    .orderBy(asc(cores.nome))
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarCorAction(
  input: CorInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('cores')

  const parsed = corSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const existing = await db
    .select({ id: cores.id })
    .from(cores)
    .where(and(eq(cores.nome, data.nome), isNull(cores.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe uma cor chamada "${data.nome}"` }
  }

  const [inserted] = await db
    .insert(cores)
    .values({
      nome: data.nome,
      codigoHex: data.codigoHex,
      codigoHex2: data.codigoHex2,
      ativo: data.ativo,
    })
    .returning({ id: cores.id })

  revalidatePath('/cores')
  return {
    success: true,
    data: { id: inserted!.id },
    message: 'Cor cadastrada',
  }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarCorAction(
  id: string,
  input: CorInput,
): Promise<ActionResult> {
  await requireAreaEscrita('cores')

  const parsed = corSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: cores.id })
    .from(cores)
    .where(and(eq(cores.id, id), isNull(cores.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Cor não encontrada' }
  }

  // Nome único entre OUTRAS cores ativas.
  const conflicting = await db
    .select({ id: cores.id })
    .from(cores)
    .where(and(eq(cores.nome, data.nome), isNull(cores.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return { success: false, error: `Já existe outra cor chamada "${data.nome}"` }
  }

  await db
    .update(cores)
    .set({
      nome: data.nome,
      codigoHex: data.codigoHex,
      codigoHex2: data.codigoHex2,
      ativo: data.ativo,
    })
    .where(eq(cores.id, id))

  revalidatePath('/cores')
  return { success: true, message: 'Cor atualizada' }
}

// -----------------------------------------------------------------
// Soft delete
// -----------------------------------------------------------------

export async function excluirCorAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('cores')

  const [atual] = await db
    .select({ id: cores.id })
    .from(cores)
    .where(and(eq(cores.id, id), isNull(cores.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Cor não encontrada' }
  }

  await db
    .update(cores)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(cores.id, id))

  revalidatePath('/cores')
  return { success: true, message: 'Cor excluída' }
}

// -----------------------------------------------------------------
// Excluir múltiplas (bulk delete)
// -----------------------------------------------------------------

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function excluirMultiplasCoresAction(
  ids: string[],
): Promise<ActionResult<{ excluidas: number }>> {
  await requireAreaEscrita('cores')

  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'Selecione ao menos uma cor' }
  }

  const idsValidos = ids.filter((id) => uuidRegex.test(id))
  if (idsValidos.length === 0) {
    return { success: false, error: 'Nenhum ID válido na seleção' }
  }

  const now = new Date()
  const result = await db
    .update(cores)
    .set({ deletedAt: now, ativo: false })
    .where(and(inArray(cores.id, idsValidos), isNull(cores.deletedAt)))
    .returning({ id: cores.id })

  revalidatePath('/cores')
  return {
    success: true,
    data: { excluidas: result.length },
    message:
      result.length === 1
        ? '1 cor excluída'
        : `${result.length} cores excluídas`,
  }
}
