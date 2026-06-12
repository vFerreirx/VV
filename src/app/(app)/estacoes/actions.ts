'use server'

import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { estacoes, maquinas, users, type Estacao } from '@/lib/db/schema'
import { estacaoSchema, type EstacaoInput } from '@/lib/validators/estacoes'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// Estação com nomes resolvidos + máquinas vinculadas (pra lista/edição).
export type EstacaoComDetalhes = Estacao & {
  operadorDiaNome: string | null
  operadorNoiteNome: string | null
  maquinaIds: string[]
  maquinaCodigos: string[]
}

export type OperadorOpcao = { id: string; nome: string }
export type MaquinaOpcao = { id: string; codigo: string; nome: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarEstacoes(): Promise<EstacaoComDetalhes[]> {
  await requireRole(['admin', 'gerente_producao'])

  const rows = await db
    .select()
    .from(estacoes)
    .where(isNull(estacoes.deletedAt))
    .orderBy(asc(estacoes.nome))

  if (rows.length === 0) return []

  // Resolve nomes dos operadores e máquinas de cada estação.
  const ids = rows.map((e) => e.id)
  const opIds = rows
    .flatMap((e) => [e.operadorDiaId, e.operadorNoiteId])
    .filter((x): x is string => Boolean(x))

  const ops =
    opIds.length > 0
      ? await db
          .select({ id: users.id, nome: users.nome })
          .from(users)
          .where(inArray(users.id, opIds))
      : []
  const opNome = new Map(ops.map((o) => [o.id, o.nome]))

  const maqs = await db
    .select({ id: maquinas.id, codigo: maquinas.codigo, estacaoId: maquinas.estacaoId })
    .from(maquinas)
    .where(and(isNull(maquinas.deletedAt), inArray(maquinas.estacaoId, ids)))
    .orderBy(asc(maquinas.codigo))

  return rows.map((e) => {
    const minhas = maqs.filter((m) => m.estacaoId === e.id)
    return {
      ...e,
      operadorDiaNome: e.operadorDiaId ? (opNome.get(e.operadorDiaId) ?? null) : null,
      operadorNoiteNome: e.operadorNoiteId
        ? (opNome.get(e.operadorNoiteId) ?? null)
        : null,
      maquinaIds: minhas.map((m) => m.id),
      maquinaCodigos: minhas.map((m) => m.codigo),
    }
  })
}

// Operadores ativos (pra selects de dia/noite).
export async function listarOperadores(): Promise<OperadorOpcao[]> {
  await requireRole(['admin', 'gerente_producao'])
  return db
    .select({ id: users.id, nome: users.nome })
    .from(users)
    .where(
      and(eq(users.role, 'operador'), eq(users.ativo, true), isNull(users.deletedAt)),
    )
    .orderBy(asc(users.nome))
}

// Máquinas ativas (pra multi-select).
export async function listarMaquinasOpcoes(): Promise<MaquinaOpcao[]> {
  await requireRole(['admin', 'gerente_producao'])
  return db
    .select({ id: maquinas.id, codigo: maquinas.codigo, nome: maquinas.nome })
    .from(maquinas)
    .where(isNull(maquinas.deletedAt))
    .orderBy(asc(maquinas.codigo))
}

// -----------------------------------------------------------------
// Criar / atualizar (com atribuição de máquinas)
// -----------------------------------------------------------------

async function aplicarMaquinas(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  estacaoId: string,
  maquinaIds: string[],
) {
  // Desvincula as que estavam nesta estação mas saíram da seleção.
  await tx
    .update(maquinas)
    .set({ estacaoId: null })
    .where(eq(maquinas.estacaoId, estacaoId))
  // Vincula as selecionadas (tira de outra estação se preciso).
  if (maquinaIds.length > 0) {
    await tx
      .update(maquinas)
      .set({ estacaoId })
      .where(inArray(maquinas.id, maquinaIds))
  }
}

export async function criarEstacaoAction(
  input: EstacaoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = estacaoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const existing = await db
    .select({ id: estacoes.id })
    .from(estacoes)
    .where(and(eq(estacoes.nome, data.nome), isNull(estacoes.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe uma estação "${data.nome}"` }
  }

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(estacoes)
      .values({
        nome: data.nome,
        cor: data.cor ?? null,
        operadorDiaId: data.operadorDiaId ?? null,
        operadorNoiteId: data.operadorNoiteId ?? null,
      })
      .returning({ id: estacoes.id })
    await aplicarMaquinas(tx, inserted!.id, data.maquinaIds ?? [])
    return inserted!.id
  })

  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, data: { id: novoId }, message: 'Estação criada' }
}

export async function atualizarEstacaoAction(
  id: string,
  input: EstacaoInput,
): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const parsed = estacaoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: estacoes.id })
    .from(estacoes)
    .where(and(eq(estacoes.id, id), isNull(estacoes.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Estação não encontrada' }

  // Nome único entre OUTRAS estações.
  const conflito = await db
    .select({ id: estacoes.id })
    .from(estacoes)
    .where(
      and(
        eq(estacoes.nome, data.nome),
        isNull(estacoes.deletedAt),
        ne(estacoes.id, id),
      ),
    )
    .limit(1)
  if (conflito.length > 0) {
    return { success: false, error: `Já existe outra estação "${data.nome}"` }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(estacoes)
      .set({
        nome: data.nome,
        cor: data.cor ?? null,
        operadorDiaId: data.operadorDiaId ?? null,
        operadorNoiteId: data.operadorNoiteId ?? null,
      })
      .where(eq(estacoes.id, id))
    await aplicarMaquinas(tx, id, data.maquinaIds ?? [])
  })

  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, message: 'Estação atualizada' }
}

// -----------------------------------------------------------------
// Excluir (soft delete + solta as máquinas)
// -----------------------------------------------------------------

export async function excluirEstacaoAction(id: string): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) return { success: false, error: 'ID inválido' }

  await db.transaction(async (tx) => {
    await tx
      .update(estacoes)
      .set({ deletedAt: new Date(), ativo: false })
      .where(and(eq(estacoes.id, id), isNull(estacoes.deletedAt)))
    await tx
      .update(maquinas)
      .set({ estacaoId: null })
      .where(eq(maquinas.estacaoId, id))
  })

  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, message: 'Estação excluída' }
}
