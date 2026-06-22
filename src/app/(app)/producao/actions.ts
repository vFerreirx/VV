'use server'

import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  apontamentosProducao,
  estacoes,
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
  responsavelId: string | null
  responsavelNome: string | null
  estacaoCor: string | null
  estacaoNome: string | null
  produzido: number
  dataPrevistaFim: Date | null
  atrasada: boolean
  // Quando a OP entrou no status atual (pra mostrar "tempo na etapa").
  desdeStatus: Date
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
    // Cancelado e enviado (concluído) ficam fora do kanban — concluídas
    // aparecem em Ordens com o filtro "Concluídas".
    ne(ordensProducao.status, 'cancelado'),
    ne(ordensProducao.status, 'enviado'),
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

  // Estação via máquina (rota principal) e via responsável (fallback).
  const estMaq = alias(estacoes, 'est_maq')
  const estResp = alias(estacoes, 'est_resp')

  const rows = await db
    .select({
      op: ordensProducao,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      responsavelNome: users.nome,
      estacaoCorMaq: estMaq.cor,
      estacaoNomeMaq: estMaq.nome,
      estacaoCorResp: estResp.cor,
      estacaoNomeResp: estResp.nome,
      produzido: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = ${ordensProducao.id}
      )`,
      // Última entrada no status atual (pra calcular tempo na etapa).
      desdeStatus: sql<string | null>`(
        SELECT MAX(${eventosKanban.createdAt})
        FROM ${eventosKanban}
        WHERE ${eventosKanban.ordemId} = ${ordensProducao.id}
          AND ${eventosKanban.statusNovo} = ${ordensProducao.status}
      )`,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .leftJoin(
      estMaq,
      and(eq(estMaq.id, maquinas.estacaoId), isNull(estMaq.deletedAt)),
    )
    .leftJoin(
      estResp,
      and(
        or(
          eq(estResp.operadorDiaId, ordensProducao.responsavelId),
          eq(estResp.operadorNoiteId, ordensProducao.responsavelId),
        ),
        isNull(estResp.deletedAt),
      ),
    )
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
      responsavelNome,
      estacaoCorMaq,
      estacaoNomeMaq,
      estacaoCorResp,
      estacaoNomeResp,
      produzido,
      desdeStatus,
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
      responsavelId: op.responsavelId,
      responsavelNome: responsavelNome ?? null,
      estacaoCor: estacaoCorMaq ?? estacaoCorResp ?? null,
      estacaoNome: estacaoNomeMaq ?? estacaoNomeResp ?? null,
      produzido: produzido ?? 0,
      dataPrevistaFim: op.dataPrevistaFim,
      atrasada:
        op.dataPrevistaFim !== null &&
        op.status !== 'enviado' &&
        new Date(op.dataPrevistaFim).getTime() < now,
      desdeStatus: desdeStatus
        ? new Date(desdeStatus)
        : (op.updatedAt ?? op.createdAt),
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
