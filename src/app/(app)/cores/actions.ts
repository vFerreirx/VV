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
import { cores, type Cor } from '@/lib/db/schema'
import { erroDeUso, mensagemDoLote } from '@/lib/catalogo-em-uso'
import { usoDeCores } from '@/lib/db/uso-do-catalogo'
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

  let inserted: { id: string } | undefined
  try {
    ;[inserted] = await db
      .insert(cores)
      .values({
        nome: data.nome,
        codigoHex: data.codigoHex,
        codigoHex2: data.codigoHex2,
        ativo: data.ativo,
      })
      .returning({ id: cores.id })
  } catch (err) {
    // Corrida entre a checagem acima e o INSERT (duplo-clique/reenvio) bate
    // na constraint UNIQUE(nome). Vira erro amigável em vez de 500.
    if (isUniqueViolation(err)) {
      return { success: false, error: `Já existe uma cor chamada "${data.nome}"` }
    }
    throw err
  }

  revalidatePath('/variacoes')
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
    .select({ id: cores.id, nome: cores.nome })
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

  // RENOMEAR LEVA AS VARIAÇÕES JUNTO, na mesma transação — o SKU não muda.
  // Ver src/lib/db/renomear-no-catalogo.ts. A tela avisa quantas antes.
  let variacoesAtualizadas = 0
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(cores)
        .set({
          nome: data.nome,
          codigoHex: data.codigoHex,
          codigoHex2: data.codigoHex2,
          ativo: data.ativo,
        })
        .where(eq(cores.id, id))
      variacoesAtualizadas = await renomearNasVariacoes(
        tx,
        'cor',
        atual.nome,
        data.nome,
      )
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: `Já existe uma cor chamada "${data.nome}"` }
    }
    throw err
  }

  revalidatePath('/variacoes')
  if (variacoesAtualizadas > 0) revalidatePath('/produtos')
  return {
    success: true,
    message: `Cor atualizada${sufixoDasVariacoes(variacoesAtualizadas)}`,
  }
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

  // ⚠️ COR EM USO NÃO SE APAGA. A variação guarda o NOME da cor como texto, e
  // o de-para do fio guarda o ID: apagar aqui deixa a variação apontando pra
  // um cadastro que sumiu (some dos filtros) e a cor do fornecedor órfã.
  // Ver src/lib/db/uso-do-catalogo.ts.
  const uso = (await usoDeCores([id])).get(id)
  if (uso?.emUso) {
    return { success: false, error: erroDeUso(uso, 'a cor') }
  }

  await db
    .update(cores)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(cores.id, id))

  revalidatePath('/variacoes')
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

  // Mesma guarda do individual, em lote: as livres saem, as em uso ficam — e
  // a mensagem diz quais e por quê.
  const usos = await usoDeCores(idsValidos)
  const bloqueadas = [...usos.values()].filter((u) => u.emUso)
  const livres = idsValidos.filter((id) => !usos.get(id)?.emUso)

  const now = new Date()
  const result =
    livres.length === 0
      ? []
      : await db
          .update(cores)
          .set({ deletedAt: now, ativo: false })
          .where(and(inArray(cores.id, livres), isNull(cores.deletedAt)))
          .returning({ id: cores.id })

  revalidatePath('/variacoes')
  if (result.length === 0 && bloqueadas.length > 0) {
    return {
      success: false,
      error: mensagemDoLote(0, bloqueadas, { um: 'cor', muitos: 'cores' }),
    }
  }
  return {
    success: true,
    data: { excluidas: result.length },
    message: mensagemDoLote(result.length, bloqueadas, {
      um: 'cor',
      muitos: 'cores',
    }),
  }
}
