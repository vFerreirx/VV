'use server'

import { and, asc, eq, gt, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import { requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  maquinas,
  ordensProducao,
  produtos,
  users,
  variacoesProduto,
} from '@/lib/db/schema'
import { type statusValues } from '@/lib/validators/ordens'

// -----------------------------------------------------------------
// KPIs principais
// -----------------------------------------------------------------

export type DashboardKPIs = {
  opsAtivas: number
  opsEmProducao: number
  opsAtrasadas: number
  opsEnviadasMes: number
  maquinasOperando: number
  maquinasTotal: number
  // distribuição por status (apenas estados ativos do kanban)
  distribuicaoStatus: Array<{
    status: (typeof statusValues)[number]
    total: number
  }>
}

export async function obterKPIs(): Promise<DashboardKPIs> {
  await requireAuth()

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  // Conta OPs por status (excluindo soft-deleted).
  const distribuicao = await db
    .select({
      status: ordensProducao.status,
      total: sql<number>`count(*)::int`,
    })
    .from(ordensProducao)
    .where(isNull(ordensProducao.deletedAt))
    .groupBy(ordensProducao.status)

  const distribuicaoMap = new Map(distribuicao.map((d) => [d.status, d.total]))

  const opsAtivas = distribuicao
    .filter((d) => d.status !== 'enviado' && d.status !== 'cancelado')
    .reduce((sum, d) => sum + d.total, 0)

  const opsEmProducao = distribuicaoMap.get('em_producao') ?? 0
  const opsEnviadasMes = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ordensProducao)
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        eq(ordensProducao.status, 'enviado'),
        gt(ordensProducao.dataRealFim, inicioMes),
      ),
    )
    .then((r) => r[0]?.total ?? 0)

  // Atrasadas: dataPrevistaFim < now AND não enviado/cancelado.
  const opsAtrasadas = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ordensProducao)
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.status, 'enviado'),
        ne(ordensProducao.status, 'cancelado'),
        isNotNull(ordensProducao.dataPrevistaFim),
        sql`${ordensProducao.dataPrevistaFim} < now()`,
      ),
    )
    .then((r) => r[0]?.total ?? 0)

  const [{ total: maquinasTotal }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(maquinas)
    .where(isNull(maquinas.deletedAt))

  const [{ total: maquinasOperando }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(maquinas)
    .where(
      and(isNull(maquinas.deletedAt), eq(maquinas.status, 'operando')),
    )

  // Distribuição visual (somente estados ativos do kanban).
  const STATUS_KANBAN_ATIVO: (typeof statusValues)[number][] = [
    'aguardando_materia_prima',
    'programado',
    'em_producao',
    'acabamento',
    'embalagem',
    'pronto_envio',
  ]
  const distribuicaoStatus = STATUS_KANBAN_ATIVO.map((s) => ({
    status: s,
    total: distribuicaoMap.get(s) ?? 0,
  }))

  return {
    opsAtivas,
    opsEmProducao,
    opsAtrasadas,
    opsEnviadasMes,
    maquinasOperando,
    maquinasTotal: maquinasTotal ?? 0,
    distribuicaoStatus,
  }
}

// -----------------------------------------------------------------
// OPs urgentes / atrasadas (pra widget no dashboard)
// -----------------------------------------------------------------

export type OpUrgenteItem = {
  id: string
  numero: string
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoTamanho: string | null
  status: (typeof statusValues)[number]
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  dataPrevistaFim: Date | null
  maquinaCodigo: string | null
  responsavelNome: string | null
  atrasada: boolean
}

export async function listarOpsUrgentes(
  limit = 5,
): Promise<OpUrgenteItem[]> {
  await requireAuth()

  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoTamanho: variacoesProduto.tamanho,
      status: ordensProducao.status,
      prioridade: ordensProducao.prioridade,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      maquinaCodigo: maquinas.codigo,
      responsavelNome: users.nome,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.status, 'enviado'),
        ne(ordensProducao.status, 'cancelado'),
      ),
    )
    // Urgentes/altas primeiro, depois prazos mais próximos.
    .orderBy(
      sql`CASE ${ordensProducao.prioridade}
        WHEN 'urgente' THEN 0
        WHEN 'alta' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'baixa' THEN 3
      END`,
      asc(ordensProducao.dataPrevistaFim),
    )
    .limit(limit)

  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    produtoNome: r.produtoNome,
    produtoSku: r.produtoSku,
    variacaoCor: r.variacaoCor ?? null,
    variacaoTamanho: r.variacaoTamanho ?? null,
    status: r.status,
    prioridade: r.prioridade,
    dataPrevistaFim: r.dataPrevistaFim,
    maquinaCodigo: r.maquinaCodigo ?? null,
    responsavelNome: r.responsavelNome ?? null,
    atrasada:
      r.dataPrevistaFim !== null &&
      new Date(r.dataPrevistaFim).getTime() < now,
  }))
}

// -----------------------------------------------------------------
// Próximas manutenções
// -----------------------------------------------------------------

export type ManutencaoProxItem = {
  id: string
  codigo: string
  nome: string
  status:
    | 'operando'
    | 'parada'
    | 'manutencao'
    | 'setup'
    | 'desativada'
  proximaManutencao: Date
  vencida: boolean
}

export async function listarProximasManutencoes(
  limit = 5,
): Promise<ManutencaoProxItem[]> {
  await requireAuth()

  const rows = await db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      status: maquinas.status,
      proximaManutencao: maquinas.proximaManutencao,
    })
    .from(maquinas)
    .where(
      and(
        isNull(maquinas.deletedAt),
        isNotNull(maquinas.proximaManutencao),
      ),
    )
    .orderBy(asc(maquinas.proximaManutencao))
    .limit(limit)

  const now = Date.now()
  return rows
    .filter((r): r is typeof r & { proximaManutencao: Date } =>
      Boolean(r.proximaManutencao),
    )
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nome: r.nome,
      status: r.status,
      proximaManutencao: r.proximaManutencao,
      vencida: new Date(r.proximaManutencao).getTime() < now,
    }))
}
