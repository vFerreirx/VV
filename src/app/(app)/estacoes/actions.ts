'use server'

import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  operadoresPorEstacao,
  vinculosDeOperadores,
  type OperadorDaEstacao,
} from '@/lib/db/estacao-operadores'
import {
  estacaoOperadores,
  estacoes,
  maquinas,
  users,
  type Estacao,
} from '@/lib/db/schema'
import { estacaoSchema, type EstacaoInput } from '@/lib/validators/estacoes'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// Estação com nomes resolvidos + máquinas vinculadas (pra lista/edição).
export type EstacaoComDetalhes = Estacao & {
  operadores: OperadorDaEstacao[]
  operadorIds: string[]
  maquinaIds: string[]
  maquinaNomes: string[]
}

// `estacaoAtual*` preenchido = o operador JÁ está em outra estação. A tela
// usa isso pra desabilitar a opção em vez de deixar o usuário escolher e só
// então tomar erro do UNIQUE do banco.
export type OperadorOpcao = {
  id: string
  nome: string
  estacaoAtualId: string | null
  estacaoAtualNome: string | null
}
export type MaquinaOpcao = { id: string; codigo: string; nome: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarEstacoes(): Promise<EstacaoComDetalhes[]> {
  await requireArea('estacoes')

  const rows = await db
    .select()
    .from(estacoes)
    .where(isNull(estacoes.deletedAt))
    .orderBy(asc(estacoes.nome))

  if (rows.length === 0) return []

  // Operadores de todas as estações numa consulta só (nada de N+1).
  // NÃO lê operadorDiaId/operadorNoiteId: são legado.
  const ids = rows.map((e) => e.id)
  const porEstacao = await operadoresPorEstacao(ids)

  const maqs = await db
    .select({
      id: maquinas.id,
      nome: maquinas.nome,
      estacaoId: maquinas.estacaoId,
    })
    .from(maquinas)
    .where(and(isNull(maquinas.deletedAt), inArray(maquinas.estacaoId, ids)))
    // Ordena pelo código (TC-01..18) pra manter a ordem numérica das máquinas.
    .orderBy(asc(maquinas.codigo))

  return rows.map((e) => {
    const minhas = maqs.filter((m) => m.estacaoId === e.id)
    const operadores = porEstacao.get(e.id) ?? []
    return {
      ...e,
      operadores,
      operadorIds: operadores.map((o) => o.id),
      maquinaIds: minhas.map((m) => m.id),
      maquinaNomes: minhas.map((m) => m.nome),
    }
  })
}

// Operadores ativos, já com a estação em que cada um está (se estiver).
//
// ⚠️ Pode voltar VAZIO: hoje não existe nenhum usuário com cargo `operador`.
// Quem trata esse caso é a tela — ela precisa dizer isso com todas as letras
// e apontar pra /usuarios, senão o admin abre, vê select vazio e acha que
// quebrou.
export async function listarOperadores(): Promise<OperadorOpcao[]> {
  await requireArea('estacoes')
  const rows = await db
    .select({
      id: users.id,
      nome: users.nome,
      estacaoAtualId: estacoes.id,
      estacaoAtualNome: estacoes.nome,
    })
    .from(users)
    .leftJoin(estacaoOperadores, eq(estacaoOperadores.operadorId, users.id))
    // A estação entra pelo join e só conta se estiver viva: vínculo com
    // estação soft-deleted não pode "ocupar" o operador na tela.
    .leftJoin(
      estacoes,
      and(eq(estacoes.id, estacaoOperadores.estacaoId), isNull(estacoes.deletedAt)),
    )
    .where(
      and(eq(users.role, 'operador'), eq(users.ativo, true), isNull(users.deletedAt)),
    )
    .orderBy(asc(users.nome))

  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    estacaoAtualId: r.estacaoAtualId ?? null,
    estacaoAtualNome: r.estacaoAtualNome ?? null,
  }))
}

// Máquinas ativas (pra multi-select).
export async function listarMaquinasOpcoes(): Promise<MaquinaOpcao[]> {
  await requireArea('estacoes')
  return db
    .select({ id: maquinas.id, codigo: maquinas.codigo, nome: maquinas.nome })
    .from(maquinas)
    .where(isNull(maquinas.deletedAt))
    .orderBy(asc(maquinas.codigo))
}

// -----------------------------------------------------------------
// Criar / atualizar (com atribuição de máquinas)
// -----------------------------------------------------------------

// Grava os operadores da estação: apaga os vínculos atuais e insere os
// escolhidos. Apagar antes é o que torna a operação idempotente — e o
// vínculo não é histórico, quem guarda histórico é `eventos_kanban`.
async function aplicarOperadores(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  estacaoId: string,
  operadorIds: string[],
) {
  await tx
    .delete(estacaoOperadores)
    .where(eq(estacaoOperadores.estacaoId, estacaoId))
  if (operadorIds.length > 0) {
    await tx
      .insert(estacaoOperadores)
      .values(operadorIds.map((operadorId) => ({ estacaoId, operadorId })))
  }
}

/**
 * Recusa antes de tentar gravar quando algum operador escolhido já pertence
 * a OUTRA estação viva. O `UNIQUE (operador_id)` do banco continua sendo a
 * garantia real; isto existe só pra devolver "Fulano já está na estação X"
 * em vez de um erro de constraint cru.
 */
async function conflitoDeOperador(
  operadorIds: string[],
  estacaoIdAtual: string | null,
): Promise<string | null> {
  const vinculos = await vinculosDeOperadores(operadorIds)
  const deOutra = vinculos.filter((v) => v.estacaoId !== estacaoIdAtual)
  if (deOutra.length === 0) return null

  const nomes = await db
    .select({ id: users.id, nome: users.nome })
    .from(users)
    .where(inArray(users.id, deOutra.map((v) => v.operadorId)))
  const nome = new Map(nomes.map((n) => [n.id, n.nome]))

  const primeiro = deOutra[0]!
  return `${nome.get(primeiro.operadorId) ?? 'Esse operador'} já está na estação ${primeiro.estacaoNome}`
}

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
  await requireAreaEscrita('estacoes')

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

  const operadorIds = data.operadorIds ?? []
  const conflitoOperador = await conflitoDeOperador(operadorIds, null)
  if (conflitoOperador) return { success: false, error: conflitoOperador }

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(estacoes)
      .values({ nome: data.nome, cor: data.cor ?? null })
      .returning({ id: estacoes.id })
    await aplicarOperadores(tx, inserted!.id, operadorIds)
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
  await requireAreaEscrita('estacoes')

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

  const operadorIds = data.operadorIds ?? []
  const conflitoOperador = await conflitoDeOperador(operadorIds, id)
  if (conflitoOperador) return { success: false, error: conflitoOperador }

  await db.transaction(async (tx) => {
    await tx
      .update(estacoes)
      .set({ nome: data.nome, cor: data.cor ?? null })
      .where(eq(estacoes.id, id))
    await aplicarOperadores(tx, id, operadorIds)
    await aplicarMaquinas(tx, id, data.maquinaIds ?? [])
  })

  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, message: 'Estação atualizada' }
}

// -----------------------------------------------------------------
// Excluir (soft delete + solta as máquinas + APAGA os vínculos)
// -----------------------------------------------------------------

export async function excluirEstacaoAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('estacoes')

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
    // Vínculo de operador é apagado DE VERDADE, não soft-deleted. A estação
    // some por UPDATE, então o ON DELETE CASCADE não dispara — e como o
    // UNIQUE em operador_id é global, deixar a linha aqui prenderia o
    // operador a uma estação fantasma pra sempre.
    await tx
      .delete(estacaoOperadores)
      .where(eq(estacaoOperadores.estacaoId, id))
  })

  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, message: 'Estação excluída' }
}
