'use server'

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { modelos, type Modelo } from '@/lib/db/schema'
import { modeloSchema, type ModeloInput } from '@/lib/validators/modelos'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export async function listarModelos(): Promise<Modelo[]> {
  await requireAuth()
  return db
    .select()
    .from(modelos)
    .where(isNull(modelos.deletedAt))
    .orderBy(asc(modelos.nome))
}

export async function listarModelosAtivos(): Promise<Modelo[]> {
  await requireAuth()
  return db
    .select()
    .from(modelos)
    .where(and(isNull(modelos.deletedAt), eq(modelos.ativo, true)))
    .orderBy(asc(modelos.nome))
}

export async function criarModeloAction(
  input: ModeloInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('modelos')

  const parsed = modeloSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const existing = await db
    .select({ id: modelos.id })
    .from(modelos)
    .where(and(eq(modelos.nome, data.nome), isNull(modelos.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe um modelo "${data.nome}"` }
  }

  const [inserted] = await db
    .insert(modelos)
    .values({
      nome: data.nome,
      descricao: data.descricao ?? null,
      ativo: data.ativo,
    })
    .returning({ id: modelos.id })

  revalidatePath('/variacoes')
  return {
    success: true,
    data: { id: inserted!.id },
    message: 'Modelo cadastrado',
  }
}

export async function atualizarModeloAction(
  id: string,
  input: ModeloInput,
): Promise<ActionResult> {
  await requireAreaEscrita('modelos')

  const parsed = modeloSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: modelos.id })
    .from(modelos)
    .where(and(eq(modelos.id, id), isNull(modelos.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Modelo não encontrado' }
  }

  const conflicting = await db
    .select({ id: modelos.id })
    .from(modelos)
    .where(and(eq(modelos.nome, data.nome), isNull(modelos.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return { success: false, error: `Já existe outro modelo "${data.nome}"` }
  }

  await db
    .update(modelos)
    .set({
      nome: data.nome,
      descricao: data.descricao ?? null,
      ativo: data.ativo,
    })
    .where(eq(modelos.id, id))

  revalidatePath('/variacoes')
  return { success: true, message: 'Modelo atualizado' }
}

export async function excluirModeloAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('modelos')

  const [atual] = await db
    .select({ id: modelos.id })
    .from(modelos)
    .where(and(eq(modelos.id, id), isNull(modelos.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Modelo não encontrado' }
  }

  await db
    .update(modelos)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(modelos.id, id))

  revalidatePath('/variacoes')
  return { success: true, message: 'Modelo excluído' }
}

// -----------------------------------------------------------------
// Excluir múltiplos (bulk delete)
// -----------------------------------------------------------------

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function excluirMultiplosModelosAction(
  ids: string[],
): Promise<ActionResult<{ excluidos: number }>> {
  await requireAreaEscrita('modelos')

  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'Selecione ao menos um modelo' }
  }
  const idsValidos = ids.filter((id) => uuidRegex.test(id))
  if (idsValidos.length === 0) {
    return { success: false, error: 'Nenhum ID válido na seleção' }
  }

  const result = await db
    .update(modelos)
    .set({ deletedAt: new Date(), ativo: false })
    .where(and(inArray(modelos.id, idsValidos), isNull(modelos.deletedAt)))
    .returning({ id: modelos.id })

  revalidatePath('/variacoes')
  return {
    success: true,
    data: { excluidos: result.length },
    message:
      result.length === 1
        ? '1 modelo excluído'
        : `${result.length} modelos excluídos`,
  }
}
