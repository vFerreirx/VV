'use server'

import { and, asc, eq, gte, isNull, lte, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  eventosFull,
  ordensProducao,
  produtos,
  remessasFull,
} from '@/lib/db/schema'
import {
  eventoFullSchema,
  type EventoFullInput,
} from '@/lib/validators/eventos'
import { type prioridadeValues, type statusValues } from '@/lib/validators/ordens'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Tipos expostos ao client
// -----------------------------------------------------------------

export type EventoFullItem = {
  id: string
  data: string // YYYY-MM-DD
  canal: 'full_ml' | 'full_shopee'
  observacao: string | null
  // true quando vem de uma remessa Full real (cadastrada em Ordens):
  // aparece automaticamente e não pode ser excluída pelo calendário.
  remessa?: boolean
}

export type OpAgendaItem = {
  id: string
  numero: string
  produtoNome: string
  data: string // YYYY-MM-DD (data prevista de fim)
  prioridade: (typeof prioridadeValues)[number]
  status: (typeof statusValues)[number]
  atrasada: boolean
}

// -----------------------------------------------------------------
// Leitura do mês (recebe range YYYY-MM-DD inclusivo)
// -----------------------------------------------------------------

export async function listarEventosFull(
  inicio: string,
  fim: string,
): Promise<EventoFullItem[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: eventosFull.id,
      data: eventosFull.data,
      canal: eventosFull.canal,
      observacao: eventosFull.observacao,
    })
    .from(eventosFull)
    .where(
      and(
        isNull(eventosFull.deletedAt),
        gte(eventosFull.data, inicio),
        lte(eventosFull.data, fim),
      ),
    )
    .orderBy(asc(eventosFull.data))

  // Remessas Full reais (cadastradas em Ordens) entram automaticamente,
  // com a contagem de OPs/peças na observação (vira tooltip).
  const remessas = await db
    .select({
      id: remessasFull.id,
      data: remessasFull.dataEnvio,
      canal: remessasFull.canal,
      ops: sql<number>`(
        SELECT COUNT(*)::int FROM ${ordensProducao}
        WHERE ${ordensProducao.remessaFullId} = ${remessasFull.id}
          AND ${ordensProducao.deletedAt} IS NULL
          AND ${ordensProducao.status} <> 'cancelado'
      )`,
      unidades: sql<number>`(
        SELECT COALESCE(SUM(${ordensProducao.quantidade}), 0)::int
        FROM ${ordensProducao}
        WHERE ${ordensProducao.remessaFullId} = ${remessasFull.id}
          AND ${ordensProducao.deletedAt} IS NULL
          AND ${ordensProducao.status} <> 'cancelado'
      )`,
    })
    .from(remessasFull)
    .where(
      and(
        isNull(remessasFull.deletedAt),
        gte(remessasFull.dataEnvio, inicio),
        lte(remessasFull.dataEnvio, fim),
      ),
    )
    .orderBy(asc(remessasFull.dataEnvio))

  const itens: EventoFullItem[] = [
    ...rows.map(
      (r): EventoFullItem => ({
        id: r.id,
        data: r.data,
        canal: (r.canal === 'full_shopee' ? 'full_shopee' : 'full_ml') as
          | 'full_ml'
          | 'full_shopee',
        observacao: r.observacao ?? null,
      }),
    ),
    ...remessas.map(
      (r): EventoFullItem => ({
        id: r.id,
        data: r.data,
        canal: r.canal as 'full_ml' | 'full_shopee',
        observacao: `${r.ops} OPs · ${r.unidades} un`,
        remessa: true,
      }),
    ),
  ]

  itens.sort((a, b) => a.data.localeCompare(b.data))
  return itens
}

export async function listarOpsComPrazo(
  inicio: string,
  fim: string,
): Promise<OpAgendaItem[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      produtoNome: produtos.nome,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      prioridade: ordensProducao.prioridade,
      status: ordensProducao.status,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.status, 'cancelado'),
        sql`${ordensProducao.dataPrevistaFim}::date >= ${inicio}`,
        sql`${ordensProducao.dataPrevistaFim}::date <= ${fim}`,
      ),
    )
    .orderBy(asc(ordensProducao.dataPrevistaFim))

  const now = Date.now()
  return rows
    .filter((r): r is typeof r & { dataPrevistaFim: Date } =>
      Boolean(r.dataPrevistaFim),
    )
    .map((r) => {
      const d = new Date(r.dataPrevistaFim)
      const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      return {
        id: r.id,
        numero: r.numero,
        produtoNome: r.produtoNome,
        data: ymd,
        prioridade: r.prioridade,
        status: r.status,
        atrasada: d.getTime() < now && r.status !== 'enviado',
      }
    })
}

// -----------------------------------------------------------------
// Criar / excluir evento Full
// -----------------------------------------------------------------

export async function criarEventoFullAction(
  input: EventoFullInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('calendario')

  const parsed = eventoFullSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [inserted] = await db
    .insert(eventosFull)
    .values({
      data: data.data,
      canal: data.canal,
      observacao: data.observacao ?? null,
    })
    .returning({ id: eventosFull.id })

  revalidatePath('/calendario')
  return { success: true, data: { id: inserted!.id }, message: 'Envio agendado' }
}

export async function excluirEventoFullAction(
  id: string,
): Promise<ActionResult> {
  await requireAreaEscrita('calendario')

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return { success: false, error: 'ID inválido' }
  }

  await db
    .update(eventosFull)
    .set({ deletedAt: new Date() })
    .where(and(eq(eventosFull.id, id), isNull(eventosFull.deletedAt)))

  revalidatePath('/calendario')
  return { success: true, message: 'Envio removido' }
}
