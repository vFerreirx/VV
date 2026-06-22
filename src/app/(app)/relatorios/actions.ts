'use server'

import { and, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm'

import { requireArea } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { vendas, vendasMarketplace } from '@/lib/db/schema'

export type RelatorioMensal = {
  inicio: string
  fim: string
  vendas: {
    faturamento: number
    unidades: number
    dias: number
    ticketMedio: number
  }
  porConta: {
    conta: string
    marketplace: string
    unidades: number
    faturamento: number
  }[]
  porDia: { data: string; unidades: number; faturamento: number | null }[]
}

// Dia seguinte a um YYYY-MM-DD (limite exclusivo do período).
function diaSeguinte(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function obterRelatorioPeriodo(
  inicio: string,
  fim: string,
): Promise<RelatorioMensal> {
  await requireArea('vendas')
  const prox = diaSeguinte(fim)

  const noMesVendas = and(
    gte(vendas.data, inicio),
    lt(vendas.data, prox),
    isNull(vendas.deletedAt),
  )

  const [aggVendas, porContaRows, porDiaRows] = await Promise.all([
    db
      .select({
        faturamento: sql<string>`coalesce(sum(${vendas.faturamento}), 0)`,
        unidades: sql<string>`coalesce(sum(${vendas.quantidade}), 0)`,
        dias: sql<string>`count(*)`,
      })
      .from(vendas)
      .where(noMesVendas),

    db
      .select({
        conta: vendasMarketplace.conta,
        marketplace: vendasMarketplace.marketplace,
        unidades: sql<string>`coalesce(sum(${vendasMarketplace.quantidade}), 0)`,
        faturamento: sql<string>`coalesce(sum(${vendasMarketplace.faturamento}), 0)`,
      })
      .from(vendasMarketplace)
      .innerJoin(vendas, eq(vendas.id, vendasMarketplace.vendaId))
      .where(noMesVendas)
      .groupBy(vendasMarketplace.conta, vendasMarketplace.marketplace),

    db
      .select({
        data: vendas.data,
        unidades: vendas.quantidade,
        faturamento: vendas.faturamento,
      })
      .from(vendas)
      .where(noMesVendas)
      .orderBy(vendas.data),
  ])

  const faturamento = num(aggVendas[0]?.faturamento)
  const unidades = num(aggVendas[0]?.unidades)

  return {
    inicio,
    fim,
    vendas: {
      faturamento,
      unidades,
      dias: num(aggVendas[0]?.dias),
      ticketMedio: unidades > 0 ? faturamento / unidades : 0,
    },
    porConta: porContaRows.map((r) => ({
      conta: r.conta,
      marketplace: r.marketplace,
      unidades: num(r.unidades),
      faturamento: num(r.faturamento),
    })),
    porDia: porDiaRows.map((r) => ({
      data: r.data,
      unidades: r.unidades,
      faturamento: r.faturamento === null ? null : num(r.faturamento),
    })),
  }
}

// -----------------------------------------------------------------
// Tendência por conta de marketplace (gráfico de linhas com filtros)
// -----------------------------------------------------------------

export type TendenciaMetrica = 'faturamento' | 'quantidade'

export type PontoTendencia = { label: string; [conta: string]: number | string }

export type TendenciaMarketplace = {
  metrica: TendenciaMetrica
  pontos: PontoTendencia[]
  // contas que tiveram movimento no período, ordenadas por total desc.
  contas: { key: string; total: number }[]
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function obterTendenciaPeriodo(
  inicio: string,
  fim: string,
  metrica: TendenciaMetrica,
): Promise<TendenciaMarketplace> {
  await requireArea('vendas')

  const [iy, im, id] = inicio.split('-').map(Number)
  const inicioDate = new Date(iy, im - 1, id)

  const col =
    metrica === 'quantidade'
      ? vendasMarketplace.quantidade
      : vendasMarketplace.faturamento

  const rows = await db
    .select({
      data: vendas.data,
      conta: vendasMarketplace.conta,
      valor: sql<string>`coalesce(sum(${col}), 0)`,
    })
    .from(vendasMarketplace)
    .innerJoin(vendas, eq(vendas.id, vendasMarketplace.vendaId))
    .where(
      and(gte(vendas.data, inicio), lte(vendas.data, fim), isNull(vendas.deletedAt)),
    )
    .groupBy(vendas.data, vendasMarketplace.conta)

  // data -> conta -> valor ; e total por conta
  const porDia = new Map<string, Record<string, number>>()
  const totalPorConta = new Map<string, number>()
  for (const r of rows) {
    const v = num(r.valor)
    if (!porDia.has(r.data)) porDia.set(r.data, {})
    porDia.get(r.data)![r.conta] = v
    totalPorConta.set(r.conta, (totalPorConta.get(r.conta) ?? 0) + v)
  }

  const contas = [...totalPorConta.entries()]
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total)

  // Enumera todos os dias do período (preenchendo zeros).
  const pontos: PontoTendencia[] = []
  const cur = new Date(inicioDate)
  while (isoLocal(cur) <= fim) {
    const iso = isoLocal(cur)
    const [, mm, dd] = iso.split('-')
    const doDia = porDia.get(iso) ?? {}
    const ponto: PontoTendencia = { label: `${dd}/${mm}` }
    for (const c of contas) ponto[c.key] = doDia[c.key] ?? 0
    pontos.push(ponto)
    cur.setDate(cur.getDate() + 1)
  }

  return { metrica, pontos, contas }
}
