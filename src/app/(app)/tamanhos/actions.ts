'use server'

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import { tamanhos, type Tamanho } from '@/lib/db/schema'
import {
  erroAoRenomearTamanho,
  erroDeUso,
  mensagemDoLote,
} from '@/lib/catalogo-em-uso'
import { usoDeTamanhos } from '@/lib/db/uso-do-catalogo'
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
  await requireAreaEscrita('tamanhos')

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

  let inserted: { id: string } | undefined
  try {
    ;[inserted] = await db
      .insert(tamanhos)
      .values({
        nome: data.nome,
        codigo: data.codigo || null,
        larguraCm: data.larguraCm ?? null,
        comprimentoCm: data.comprimentoCm ?? null,
        pesoGramas: data.pesoGramas ?? null,
        ordem: data.ordem,
        grupo: data.grupo,
        ativo: data.ativo,
      })
      .returning({ id: tamanhos.id })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: `Já existe um tamanho "${data.nome}"` }
    }
    throw err
  }

  revalidatePath('/variacoes')
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
  await requireAreaEscrita('tamanhos')

  const parsed = tamanhoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: tamanhos.id, nome: tamanhos.nome })
    .from(tamanhos)
    .where(and(eq(tamanhos.id, id), isNull(tamanhos.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Tamanho não encontrado' }
  }

  // ⚠️ RENOMEAR TAMANHO EM USO É RECUSADO — ao contrário de cor e modelo, que
  // levam as variações junto. O nome é chave de preço de kit e do peso no
  // pedido; ver `erroAoRenomearTamanho` (src/lib/catalogo-em-uso.ts). Só
  // consulta quando o nome mudou: salvar peso ou código não paga a conta.
  if (atual.nome.trim() !== data.nome.trim()) {
    const usoDoNome = (await usoDeTamanhos([id], { para: 'renomear' })).get(id)
    const erro = usoDoNome
      ? erroAoRenomearTamanho(atual.nome, data.nome, usoDoNome)
      : null
    if (erro) return { success: false, error: erro }
  }

  const conflicting = await db
    .select({ id: tamanhos.id })
    .from(tamanhos)
    .where(and(eq(tamanhos.nome, data.nome), isNull(tamanhos.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return { success: false, error: `Já existe outro tamanho "${data.nome}"` }
  }

  try {
    await db
      .update(tamanhos)
      .set({
        nome: data.nome,
        codigo: data.codigo || null,
        larguraCm: data.larguraCm ?? null,
        comprimentoCm: data.comprimentoCm ?? null,
        pesoGramas: data.pesoGramas ?? null,
        ordem: data.ordem,
        grupo: data.grupo,
        ativo: data.ativo,
      })
      .where(eq(tamanhos.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: `Já existe outro tamanho "${data.nome}"` }
    }
    throw err
  }

  revalidatePath('/variacoes')
  return { success: true, message: 'Tamanho atualizado' }
}

export async function excluirTamanhoAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('tamanhos')

  const [atual] = await db
    .select({ id: tamanhos.id })
    .from(tamanhos)
    .where(and(eq(tamanhos.id, id), isNull(tamanhos.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Tamanho não encontrado' }
  }

  // ⚠️ TAMANHO EM USO NÃO SE APAGA. O vínculo é por TEXTO: apagar o cadastro
  // não quebra nada na hora, mas o peso padrão some da conta do frete (o
  // pedido passa a cotar 0 g naquela peça) e o preço daquele tamanho fica
  // sem jeito de editar. Ver src/lib/db/uso-do-catalogo.ts.
  const uso = (await usoDeTamanhos([id])).get(id)
  if (uso?.emUso) {
    return { success: false, error: erroDeUso(uso, 'o tamanho') }
  }

  await db
    .update(tamanhos)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(tamanhos.id, id))

  revalidatePath('/variacoes')
  return { success: true, message: 'Tamanho excluído' }
}

// -----------------------------------------------------------------
// Excluir múltiplos (bulk delete)
// -----------------------------------------------------------------

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function excluirMultiplosTamanhosAction(
  ids: string[],
): Promise<ActionResult<{ excluidos: number }>> {
  await requireAreaEscrita('tamanhos')

  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'Selecione ao menos um tamanho' }
  }
  const idsValidos = ids.filter((id) => uuidRegex.test(id))
  if (idsValidos.length === 0) {
    return { success: false, error: 'Nenhum ID válido na seleção' }
  }

  // Mesma guarda do individual, em lote: os livres saem, os em uso ficam — e
  // a mensagem diz quais e por quê. Recusar os dez por causa de um seria pior;
  // apagar em silêncio, muito pior.
  const usos = await usoDeTamanhos(idsValidos)
  const bloqueados = [...usos.values()].filter((u) => u.emUso)
  const livres = idsValidos.filter((id) => !usos.get(id)?.emUso)

  const result =
    livres.length === 0
      ? []
      : await db
          .update(tamanhos)
          .set({ deletedAt: new Date(), ativo: false })
          .where(and(inArray(tamanhos.id, livres), isNull(tamanhos.deletedAt)))
          .returning({ id: tamanhos.id })

  revalidatePath('/variacoes')
  if (result.length === 0 && bloqueados.length > 0) {
    return {
      success: false,
      error: mensagemDoLote(0, bloqueados, { um: 'tamanho', muitos: 'tamanhos' }),
    }
  }
  return {
    success: true,
    data: { excluidos: result.length },
    message: mensagemDoLote(result.length, bloqueados, {
      um: 'tamanho',
      muitos: 'tamanhos',
    }),
  }
}
