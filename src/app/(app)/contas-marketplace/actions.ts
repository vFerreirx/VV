'use server'

import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import {
  contasMarketplace,
  remessasFull,
  type ContaMarketplace,
} from '@/lib/db/schema'
import {
  contaMarketplaceSchema,
  type ContaMarketplaceInput,
} from '@/lib/validators/contas-marketplace'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export type ContaComUso = ContaMarketplace & {
  // Quantas remessas já saíram por esta conta — a tela usa isso pra avisar
  // antes de excluir.
  remessas: number
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarContas(): Promise<ContaComUso[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: contasMarketplace.id,
      canal: contasMarketplace.canal,
      nome: contasMarketplace.nome,
      ativo: contasMarketplace.ativo,
      createdAt: contasMarketplace.createdAt,
      updatedAt: contasMarketplace.updatedAt,
      deletedAt: contasMarketplace.deletedAt,
      // "contas_marketplace"."id" escrito à mão: num select de tabela única
      // o Drizzle não qualifica as colunas, e aí o `id` da subconsulta se
      // resolveria como remessas_full.id — a contagem daria sempre zero.
      remessas: sql<number>`(
        SELECT count(*)::int FROM ${remessasFull} r
        WHERE r.conta_id = "contas_marketplace"."id"
          AND r.deleted_at IS NULL
      )`,
    })
    .from(contasMarketplace)
    .where(isNull(contasMarketplace.deletedAt))
    .orderBy(asc(contasMarketplace.canal), asc(contasMarketplace.nome))

  return rows as ContaComUso[]
}

// Só as ativas, do canal pedido — é o que alimenta o seletor na criação de
// remessa. Conta desligada continua no histórico mas não é mais oferecida.
export async function listarContasAtivas(): Promise<ContaMarketplace[]> {
  await requireAuth()
  return db
    .select()
    .from(contasMarketplace)
    .where(
      and(
        isNull(contasMarketplace.deletedAt),
        eq(contasMarketplace.ativo, true),
      ),
    )
    .orderBy(asc(contasMarketplace.canal), asc(contasMarketplace.nome))
}

// -----------------------------------------------------------------
// Criar / atualizar / excluir
// -----------------------------------------------------------------

function duplicada(canal: string, nome: string): string {
  const label = CANAL_LABEL_CURTO[canal as keyof typeof CANAL_LABEL_CURTO]
  return `Já existe uma conta "${nome}" no ${label}`
}

export async function criarContaAction(
  input: ContaMarketplaceInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('contasMarketplace')

  const parsed = contaMarketplaceSchema.safeParse(input)
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
      .insert(contasMarketplace)
      .values({ canal: data.canal, nome: data.nome, ativo: data.ativo })
      .returning({ id: contasMarketplace.id })
  } catch (err) {
    // Índice único parcial (canal, nome) entre as não-excluídas.
    if (isUniqueViolation(err)) {
      return { success: false, error: duplicada(data.canal, data.nome) }
    }
    throw err
  }

  revalidatePath('/contas-marketplace')
  return {
    success: true,
    data: { id: inserted!.id },
    message: 'Conta cadastrada',
  }
}

export async function atualizarContaAction(
  id: string,
  input: ContaMarketplaceInput,
): Promise<ActionResult> {
  await requireAreaEscrita('contasMarketplace')

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const parsed = contaMarketplaceSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: contasMarketplace.id })
    .from(contasMarketplace)
    .where(
      and(eq(contasMarketplace.id, id), isNull(contasMarketplace.deletedAt)),
    )
    .limit(1)
  if (!atual) return { success: false, error: 'Conta não encontrada' }

  try {
    await db
      .update(contasMarketplace)
      .set({ canal: data.canal, nome: data.nome, ativo: data.ativo })
      .where(eq(contasMarketplace.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: duplicada(data.canal, data.nome) }
    }
    throw err
  }

  revalidatePath('/contas-marketplace')
  revalidatePath('/remessas')
  return { success: true, message: 'Conta atualizada' }
}

// Soft delete. As remessas que já saíram por esta conta NÃO são tocadas —
// elas continuam apontando pra ela e a tela de remessas segue mostrando o
// nome. Quem some é só a oferta nos formulários.
export async function excluirContaAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('contasMarketplace')

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await db
    .select({ id: contasMarketplace.id })
    .from(contasMarketplace)
    .where(
      and(eq(contasMarketplace.id, id), isNull(contasMarketplace.deletedAt)),
    )
    .limit(1)
  if (!atual) return { success: false, error: 'Conta não encontrada' }

  await db
    .update(contasMarketplace)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(contasMarketplace.id, id))

  revalidatePath('/contas-marketplace')
  return { success: true, message: 'Conta excluída' }
}
