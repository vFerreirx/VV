'use server'

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import {
  renomearNasVariacoes,
  sufixoDasVariacoes,
} from '@/lib/db/renomear-no-catalogo'
import { modelos, type Modelo } from '@/lib/db/schema'
import { erroDeUso, mensagemDoLote } from '@/lib/catalogo-em-uso'
import { usoDeModelos } from '@/lib/db/uso-do-catalogo'
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

  let inserted: { id: string } | undefined
  try {
    ;[inserted] = await db
      .insert(modelos)
      .values({
        nome: data.nome,
        descricao: data.descricao ?? null,
        ativo: data.ativo,
      })
      .returning({ id: modelos.id })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: `Já existe um modelo "${data.nome}"` }
    }
    throw err
  }

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
    .select({ id: modelos.id, nome: modelos.nome })
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

  // RENOMEAR LEVA AS VARIAÇÕES JUNTO, na mesma transação — o SKU não muda.
  // Foi o que faltou no "SUETER GOLA V" → "SUETER": as 18 variações ficaram
  // com o nome velho. Ver src/lib/db/renomear-no-catalogo.ts.
  let variacoesAtualizadas = 0
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(modelos)
        .set({
          nome: data.nome,
          descricao: data.descricao ?? null,
          ativo: data.ativo,
        })
        .where(eq(modelos.id, id))
      variacoesAtualizadas = await renomearNasVariacoes(
        tx,
        'modelo',
        atual.nome,
        data.nome,
      )
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: `Já existe outro modelo "${data.nome}"` }
    }
    throw err
  }

  revalidatePath('/variacoes')
  if (variacoesAtualizadas > 0) revalidatePath('/produtos')
  return {
    success: true,
    message: `Modelo atualizado${sufixoDasVariacoes(variacoesAtualizadas)}`,
  }
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

  // ⚠️ MODELO EM USO NÃO SE APAGA. A variação guarda o NOME como texto: apagar
  // o cadastro não muda a variação, mas ela some dos filtros que saem daqui.
  // Ver src/lib/db/uso-do-catalogo.ts.
  const uso = (await usoDeModelos([id])).get(id)
  if (uso?.emUso) {
    return { success: false, error: erroDeUso(uso, 'o modelo') }
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

  // Mesma guarda do individual, em lote: os livres saem, os em uso ficam.
  const usos = await usoDeModelos(idsValidos)
  const bloqueados = [...usos.values()].filter((u) => u.emUso)
  const livres = idsValidos.filter((id) => !usos.get(id)?.emUso)

  const result =
    livres.length === 0
      ? []
      : await db
          .update(modelos)
          .set({ deletedAt: new Date(), ativo: false })
          .where(and(inArray(modelos.id, livres), isNull(modelos.deletedAt)))
          .returning({ id: modelos.id })

  revalidatePath('/variacoes')
  if (result.length === 0 && bloqueados.length > 0) {
    return {
      success: false,
      error: mensagemDoLote(0, bloqueados, { um: 'modelo', muitos: 'modelos' }),
    }
  }
  return {
    success: true,
    data: { excluidos: result.length },
    message: mensagemDoLote(result.length, bloqueados, {
      um: 'modelo',
      muitos: 'modelos',
    }),
  }
}
