'use server'

import { and, asc, desc, eq, ilike, isNull, ne, or } from 'drizzle-orm'

import { requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  eventosKanban,
  maquinas,
  ordensProducao,
  produtos,
  users,
  variacoesProduto,
  type EventoKanban,
} from '@/lib/db/schema'
import { canalValues, statusValues } from '@/lib/validators/ordens'

// -----------------------------------------------------------------
// Tipo do card do kanban
// -----------------------------------------------------------------

export type KanbanCardData = {
  id: string
  numero: string
  status: (typeof statusValues)[number]
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  canalDestino: (typeof canalValues)[number]
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
  quantidade: number
  maquinaId: string | null
  maquinaCodigo: string | null
  responsavelId: string | null
  responsavelNome: string | null
  responsavelCor: string | null
  dataPrevistaFim: Date | null
  atrasada: boolean
  observacoes: string | null
}

// -----------------------------------------------------------------
// Filtros do kanban
// -----------------------------------------------------------------

export type KanbanFiltros = {
  q?: string
  canal?: (typeof canalValues)[number] | 'todos'
  maquinaId?: string | 'todas'
  responsavelId?: string | 'todos'
}

export async function listarOrdensProducao(
  filtros: KanbanFiltros = {},
): Promise<KanbanCardData[]> {
  await requireAuth()

  const conditions = [
    isNull(ordensProducao.deletedAt),
    // Cancelado fica fora do kanban.
    ne(ordensProducao.status, 'cancelado'),
  ]

  if (filtros.q && filtros.q.trim().length > 0) {
    const term = `%${filtros.q.trim()}%`
    conditions.push(
      or(
        ilike(ordensProducao.numero, term),
        ilike(produtos.nome, term),
        ilike(produtos.sku, term),
      )!,
    )
  }
  if (filtros.canal && filtros.canal !== 'todos') {
    conditions.push(eq(ordensProducao.canalDestino, filtros.canal))
  }
  if (filtros.maquinaId && filtros.maquinaId !== 'todas') {
    conditions.push(eq(ordensProducao.maquinaId, filtros.maquinaId))
  }
  if (filtros.responsavelId && filtros.responsavelId !== 'todos') {
    conditions.push(eq(ordensProducao.responsavelId, filtros.responsavelId))
  }

  const rows = await db
    .select({
      op: ordensProducao,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      maquinaCodigo: maquinas.codigo,
      responsavelNome: users.nome,
      responsavelCor: users.cor,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .where(and(...conditions))
    .orderBy(
      asc(ordensProducao.prioridade),
      asc(ordensProducao.dataPrevistaFim),
    )

  const now = Date.now()
  return rows.map(
    ({
      op,
      produtoNome,
      produtoSku,
      variacaoCor,
      variacaoModelo,
      variacaoTamanho,
      maquinaCodigo,
      responsavelNome,
      responsavelCor,
    }) => ({
      id: op.id,
      numero: op.numero,
      status: op.status,
      prioridade: op.prioridade,
      canalDestino: op.canalDestino,
      produtoNome,
      produtoSku,
      variacaoCor: variacaoCor ?? null,
      variacaoModelo: variacaoModelo ?? null,
      variacaoTamanho: variacaoTamanho ?? null,
      quantidade: op.quantidade,
      maquinaId: op.maquinaId,
      maquinaCodigo: maquinaCodigo ?? null,
      responsavelId: op.responsavelId,
      responsavelNome: responsavelNome ?? null,
      responsavelCor: responsavelCor ?? null,
      dataPrevistaFim: op.dataPrevistaFim,
      atrasada:
        op.dataPrevistaFim !== null &&
        op.status !== 'enviado' &&
        new Date(op.dataPrevistaFim).getTime() < now,
      observacoes: op.observacoes,
    }),
  )
}

// -----------------------------------------------------------------
// Histórico de eventos (pra side sheet)
// -----------------------------------------------------------------

export type EventoKanbanComUsuario = EventoKanban & {
  usuarioNome: string | null
}

export async function listarEventosOrdem(
  ordemId: string,
): Promise<EventoKanbanComUsuario[]> {
  await requireAuth()
  const rows = await db
    .select({
      evento: eventosKanban,
      usuarioNome: users.nome,
    })
    .from(eventosKanban)
    .leftJoin(users, eq(users.id, eventosKanban.usuarioId))
    .where(eq(eventosKanban.ordemId, ordemId))
    .orderBy(desc(eventosKanban.createdAt))

  return rows.map(({ evento, usuarioNome }) => ({
    ...evento,
    usuarioNome: usuarioNome ?? null,
  }))
}
