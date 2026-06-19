'use server'

import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'

import { requireArea } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  apontamentosProducao,
  ordensProducao,
  users,
  vendas,
  vendasMarketplace,
} from '@/lib/db/schema'

export type RelatorioMensal = {
  mes: string
  vendas: {
    faturamento: number
    unidades: number
    dias: number
    ticketMedio: number
  }
  porMarketplace: { marketplace: string; unidades: number; faturamento: number }[]
  porDia: { data: string; unidades: number; faturamento: number | null }[]
  producao: { unidades: number; refugo: number; opsConcluidas: number }
  porOperador: { operador: string; unidades: number; refugo: number }[]
}

// Limites do mês YYYY-MM: início (inclusivo) e próximo mês (exclusivo).
function limitesDoMes(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const prox =
    m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return {
    inicio,
    prox,
    inicioTs: new Date(`${inicio}T00:00:00.000Z`),
    proxTs: new Date(`${prox}T00:00:00.000Z`),
  }
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function obterRelatorioMensal(
  mes: string,
): Promise<RelatorioMensal> {
  await requireArea('vendas')
  const { inicio, prox, inicioTs, proxTs } = limitesDoMes(mes)

  const noMesVendas = and(
    gte(vendas.data, inicio),
    lt(vendas.data, prox),
    isNull(vendas.deletedAt),
  )

  const [
    aggVendas,
    porMarketplaceRows,
    porDiaRows,
    aggProducao,
    aggOps,
    porOperadorRows,
  ] = await Promise.all([
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
        marketplace: vendasMarketplace.marketplace,
        unidades: sql<string>`coalesce(sum(${vendasMarketplace.quantidade}), 0)`,
        faturamento: sql<string>`coalesce(sum(${vendasMarketplace.faturamento}), 0)`,
      })
      .from(vendasMarketplace)
      .innerJoin(vendas, eq(vendas.id, vendasMarketplace.vendaId))
      .where(noMesVendas)
      .groupBy(vendasMarketplace.marketplace)
      .orderBy(desc(sql`sum(${vendasMarketplace.faturamento})`)),

    db
      .select({
        data: vendas.data,
        unidades: vendas.quantidade,
        faturamento: vendas.faturamento,
      })
      .from(vendas)
      .where(noMesVendas)
      .orderBy(vendas.data),

    db
      .select({
        unidades: sql<string>`coalesce(sum(${apontamentosProducao.quantidadeProduzida}), 0)`,
        refugo: sql<string>`coalesce(sum(${apontamentosProducao.quantidadeRefugo}), 0)`,
      })
      .from(apontamentosProducao)
      .where(
        and(
          gte(apontamentosProducao.inicio, inicioTs),
          lt(apontamentosProducao.inicio, proxTs),
        ),
      ),

    db
      .select({ total: sql<string>`count(*)` })
      .from(ordensProducao)
      .where(
        and(
          gte(ordensProducao.dataRealFim, inicioTs),
          lt(ordensProducao.dataRealFim, proxTs),
          isNull(ordensProducao.deletedAt),
        ),
      ),

    db
      .select({
        operador: users.nome,
        unidades: sql<string>`coalesce(sum(${apontamentosProducao.quantidadeProduzida}), 0)`,
        refugo: sql<string>`coalesce(sum(${apontamentosProducao.quantidadeRefugo}), 0)`,
      })
      .from(apontamentosProducao)
      .innerJoin(users, eq(users.id, apontamentosProducao.operadorId))
      .where(
        and(
          gte(apontamentosProducao.inicio, inicioTs),
          lt(apontamentosProducao.inicio, proxTs),
        ),
      )
      .groupBy(users.nome)
      .orderBy(desc(sql`sum(${apontamentosProducao.quantidadeProduzida})`)),
  ])

  const faturamento = num(aggVendas[0]?.faturamento)
  const unidades = num(aggVendas[0]?.unidades)

  return {
    mes,
    vendas: {
      faturamento,
      unidades,
      dias: num(aggVendas[0]?.dias),
      ticketMedio: unidades > 0 ? faturamento / unidades : 0,
    },
    porMarketplace: porMarketplaceRows.map((r) => ({
      marketplace: r.marketplace,
      unidades: num(r.unidades),
      faturamento: num(r.faturamento),
    })),
    porDia: porDiaRows.map((r) => ({
      data: r.data,
      unidades: r.unidades,
      faturamento: r.faturamento === null ? null : num(r.faturamento),
    })),
    producao: {
      unidades: num(aggProducao[0]?.unidades),
      refugo: num(aggProducao[0]?.refugo),
      opsConcluidas: num(aggOps[0]?.total),
    },
    porOperador: porOperadorRows.map((r) => ({
      operador: r.operador,
      unidades: num(r.unidades),
      refugo: num(r.refugo),
    })),
  }
}
