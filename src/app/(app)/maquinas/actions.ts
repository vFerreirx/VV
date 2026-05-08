'use server'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import {
  isManager as isManagerRole,
  requireAuth,
  requireRole,
} from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { maquinas, users, type Maquina, type User } from '@/lib/db/schema'
import {
  maquinaSchema,
  maquinasFiltrosSchema,
  trocarStatusMaquinaSchema,
  type MaquinaInput,
  type MaquinasFiltros,
  type TrocarStatusMaquinaInput,
} from '@/lib/validators/maquinas'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export type MaquinaListItem = Maquina & {
  operadorNome: string | null
  operadorEmail: string | null
  manutencaoVencida: boolean
}

export async function listarMaquinas(
  filtros: MaquinasFiltros = {},
): Promise<MaquinaListItem[]> {
  await requireAuth()

  const parsed = maquinasFiltrosSchema.safeParse(filtros)
  const { status, tipo } = parsed.success ? parsed.data : {}

  const conditions = [isNull(maquinas.deletedAt)]
  if (status && status !== 'todos') conditions.push(eq(maquinas.status, status))
  if (tipo && tipo !== 'todos') conditions.push(eq(maquinas.tipo, tipo))

  // LEFT JOIN com users pra trazer o nome do operador atual.
  const rows = await db
    .select({
      m: maquinas,
      operadorNome: users.nome,
      operadorEmail: users.email,
    })
    .from(maquinas)
    .leftJoin(users, eq(users.id, maquinas.operadorAtualId))
    .where(and(...conditions))
    .orderBy(asc(maquinas.codigo))

  const now = Date.now()
  return rows.map(({ m, operadorNome, operadorEmail }) => ({
    ...m,
    operadorNome: operadorNome ?? null,
    operadorEmail: operadorEmail ?? null,
    manutencaoVencida: m.proximaManutencao
      ? new Date(m.proximaManutencao).getTime() < now
      : false,
  }))
}

// Lista de operadores ativos (pra usar em selects).
export async function listarOperadores(): Promise<
  Array<Pick<User, 'id' | 'nome' | 'email' | 'role'>>
> {
  await requireAuth()
  return db
    .select({
      id: users.id,
      nome: users.nome,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.ativo, true), isNull(users.deletedAt)))
    .orderBy(asc(users.nome))
}

export async function obterMaquina(id: string): Promise<Maquina | null> {
  await requireAuth()
  const [m] = await db
    .select()
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  return m ?? null
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarMaquinaAction(
  input: MaquinaInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = maquinaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const codigoUpper = data.codigo.toUpperCase()
  const existing = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.codigo, codigoUpper), isNull(maquinas.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe uma máquina com código "${codigoUpper}"` }
  }

  const [inserted] = await db
    .insert(maquinas)
    .values({
      codigo: codigoUpper,
      nome: data.nome,
      tipo: data.tipo,
      status: data.status,
      diametroPolegadas: data.diametroPolegadas,
      finura: data.finura,
      numAlimentadores: data.numAlimentadores,
      capacidadeKgPorHora: data.capacidadeKgPorHora,
      operadorAtualId: data.operadorAtualId,
      ultimaManutencao: data.ultimaManutencao,
      proximaManutencao: data.proximaManutencao,
      observacoes: data.observacoes ?? null,
    })
    .returning({ id: maquinas.id })

  revalidatePath('/maquinas')
  return { success: true, data: { id: inserted!.id }, message: 'Máquina criada' }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarMaquinaAction(
  id: string,
  input: MaquinaInput,
): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = maquinaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Máquina não encontrada' }
  }

  // Código único entre OUTRAS máquinas.
  const codigoUpper = data.codigo.toUpperCase()
  const conflicting = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.codigo, codigoUpper), isNull(maquinas.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return {
      success: false,
      error: `Já existe outra máquina com código "${codigoUpper}"`,
    }
  }

  await db
    .update(maquinas)
    .set({
      codigo: codigoUpper,
      nome: data.nome,
      tipo: data.tipo,
      status: data.status,
      diametroPolegadas: data.diametroPolegadas,
      finura: data.finura,
      numAlimentadores: data.numAlimentadores,
      capacidadeKgPorHora: data.capacidadeKgPorHora,
      operadorAtualId: data.operadorAtualId,
      ultimaManutencao: data.ultimaManutencao,
      proximaManutencao: data.proximaManutencao,
      observacoes: data.observacoes ?? null,
    })
    .where(eq(maquinas.id, id))

  revalidatePath('/maquinas')
  revalidatePath(`/maquinas/${id}`)
  return { success: true, message: 'Máquina atualizada' }
}

// -----------------------------------------------------------------
// Quick action: trocar status (manager OU operador da própria máquina)
// -----------------------------------------------------------------

export async function trocarStatusAction(
  id: string,
  input: TrocarStatusMaquinaInput,
): Promise<ActionResult> {
  const user = await requireAuth()

  const parsed = trocarStatusMaquinaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select()
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Máquina não encontrada' }
  }

  // Manager pode tudo. Operador só na própria máquina.
  const podeAlterar =
    isManagerRole(user.role) ||
    (user.role === 'operador' && atual.operadorAtualId === user.id)
  if (!podeAlterar) {
    return { success: false, error: 'Sem permissão pra alterar essa máquina' }
  }

  await db
    .update(maquinas)
    .set({
      status: data.status,
      observacoes: data.observacoes ?? atual.observacoes,
    })
    .where(eq(maquinas.id, id))

  revalidatePath('/maquinas')
  return { success: true, message: 'Status atualizado' }
}

// -----------------------------------------------------------------
// Soft delete
// -----------------------------------------------------------------

export async function excluirMaquinaAction(id: string): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const [atual] = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Máquina não encontrada' }
  }

  await db
    .update(maquinas)
    .set({ deletedAt: new Date(), status: 'desativada', operadorAtualId: null })
    .where(eq(maquinas.id, id))

  revalidatePath('/maquinas')
  return { success: true, message: 'Máquina excluída' }
}
