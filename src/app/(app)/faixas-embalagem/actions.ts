'use server'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import { faixasEmbalagem, type FaixaEmbalagem } from '@/lib/db/schema'
import type { FaixaDeEmbalagem } from '@/lib/frete'
import {
  faixaEmbalagemSchema,
  type FaixaEmbalagemInput,
} from '@/lib/validators/faixas-embalagem'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export async function listarFaixasEmbalagem(): Promise<FaixaEmbalagem[]> {
  await requireAuth()
  return db
    .select()
    .from(faixasEmbalagem)
    .where(isNull(faixasEmbalagem.deletedAt))
    .orderBy(asc(faixasEmbalagem.pesoAteGramas))
}

/**
 * As faixas na forma que src/lib/frete.ts entende: numeric vem do banco como
 * string e vira number aqui, na borda, uma vez só.
 */
export async function listarFaixasParaCalculo(): Promise<FaixaDeEmbalagem[]> {
  const rows = await listarFaixasEmbalagem()
  return rows.map((f) => ({
    pesoAteGramas: f.pesoAteGramas,
    alturaCm: Number(f.alturaCm),
    larguraCm: Number(f.larguraCm),
    comprimentoCm: Number(f.comprimentoCm),
  }))
}

const DUPLICADA = 'Já existe uma faixa com esse peso máximo'

export async function criarFaixaEmbalagemAction(
  input: FaixaEmbalagemInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('faixasEmbalagem')

  const parsed = faixaEmbalagemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  let inserted: { id: string } | undefined
  try {
    ;[inserted] = await db
      .insert(faixasEmbalagem)
      .values({
        pesoAteGramas: data.pesoAteGramas,
        alturaCm: data.alturaCm,
        larguraCm: data.larguraCm,
        comprimentoCm: data.comprimentoCm,
      })
      .returning({ id: faixasEmbalagem.id })
  } catch (err) {
    if (isUniqueViolation(err)) return { success: false, error: DUPLICADA }
    throw err
  }

  revalidatePath('/faixas-embalagem')
  return {
    success: true,
    data: { id: inserted!.id },
    message: 'Faixa cadastrada',
  }
}

export async function atualizarFaixaEmbalagemAction(
  id: string,
  input: FaixaEmbalagemInput,
): Promise<ActionResult> {
  await requireAreaEscrita('faixasEmbalagem')

  const parsed = faixaEmbalagemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: faixasEmbalagem.id })
    .from(faixasEmbalagem)
    .where(and(eq(faixasEmbalagem.id, id), isNull(faixasEmbalagem.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Faixa não encontrada' }

  try {
    await db
      .update(faixasEmbalagem)
      .set({
        pesoAteGramas: data.pesoAteGramas,
        alturaCm: data.alturaCm,
        larguraCm: data.larguraCm,
        comprimentoCm: data.comprimentoCm,
      })
      .where(eq(faixasEmbalagem.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) return { success: false, error: DUPLICADA }
    throw err
  }

  revalidatePath('/faixas-embalagem')
  return { success: true, message: 'Faixa atualizada' }
}

export async function excluirFaixaEmbalagemAction(
  id: string,
): Promise<ActionResult> {
  await requireAreaEscrita('faixasEmbalagem')

  const [atual] = await db
    .select({ id: faixasEmbalagem.id })
    .from(faixasEmbalagem)
    .where(and(eq(faixasEmbalagem.id, id), isNull(faixasEmbalagem.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Faixa não encontrada' }

  await db
    .update(faixasEmbalagem)
    .set({ deletedAt: new Date() })
    .where(eq(faixasEmbalagem.id, id))

  revalidatePath('/faixas-embalagem')
  return { success: true, message: 'Faixa excluída' }
}
