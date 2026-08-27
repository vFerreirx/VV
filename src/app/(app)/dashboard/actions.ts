'use server'

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'

import { requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  FUSO_BRASIL,
  hojeEmBrasilia,
  inicioDoDiaEmBrasilia,
  somarDias,
} from '@/lib/dia-brasil'
import {
  apontamentosProducao,
  maquinas,
  ordensProducao,
  produtos,
  users,
  variacoesProduto,
} from '@/lib/db/schema'
import { type canalValues, type statusValues } from '@/lib/validators/ordens'

// O instante em que o mês corrente COMEÇOU em Brasília.
//
// Antes era `new Date()` + `setDate(1)` + `setHours(0,0,0,0)`, que usa o fuso
// do processo. Em UTC isso dá meia-noite UTC do dia 1, que é 21h do último dia
// do mês ANTERIOR em Brasília — a janela pegava três horas do mês passado, e o
// "mês corrente" virava às 21h do dia 31.
function inicioDoMes(): Date {
  return inicioDoDiaEmBrasilia(`${hojeEmBrasilia().slice(0, 7)}-01`)
}

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

  const inicioMes = inicioDoMes()

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
  maquinaNome: string | null
  responsavelNome: string | null
  atrasada: boolean
}

export async function listarOpsUrgentes(
  limit = 5,
): Promise<OpUrgenteItem[]> {
  const user = await requireAuth()

  // OP pega fica privada SÓ entre operadores; demais cargos veem tudo.
  const visibilidade = user.role !== 'operador'
    ? undefined
    : or(
        isNull(ordensProducao.responsavelId),
        eq(ordensProducao.responsavelId, user.id),
      )

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
      maquinaNome: maquinas.nome,
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
        visibilidade,
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
    maquinaNome: r.maquinaNome ?? null,
    responsavelNome: r.responsavelNome ?? null,
    atrasada:
      r.dataPrevistaFim !== null &&
      new Date(r.dataPrevistaFim).getTime() < now,
  }))
}

// -----------------------------------------------------------------
// Produção dos últimos N dias (apontamentos por dia)
// -----------------------------------------------------------------

export type ProducaoDia = {
  dia: string // YYYY-MM-DD
  produzido: number
  refugo: number
}

export async function listarProducaoUltimosDias(
  dias = 14,
): Promise<ProducaoDia[]> {
  await requireAuth()

  // A série termina HOJE em Brasília e anda pra trás em dias de calendário.
  const ultimoDia = hojeEmBrasilia()
  const primeiroDia = somarDias(ultimoDia, -(dias - 1))
  const inicio = inicioDoDiaEmBrasilia(primeiroDia)

  // ⚠️ ÚNICO `AT TIME ZONE` do código, e src/lib/dia-brasil.ts registra a
  // exceção. `apontamentos_producao.inicio` é timestamptz e o TimeZone da
  // SESSÃO do Postgres é UTC, então `to_char` cru rendia o dia em UTC: todo
  // apontamento feito das 21h à meia-noite caía no dia SEGUINTE. Com turno da
  // noite isso não é bug noturno, é produção atribuída ao dia errado todo dia.
  //
  // O fuso vem IMPORTADO de dia-brasil (`FUSO_BRASIL`), nunca redigitado aqui:
  // o nome existe uma vez só no repositório, então não há duas cópias da regra
  // pra divergirem — Postgres e ICU leem a mesma tzdata.
  //
  // Agrupar no banco (e não trazer as linhas cruas pra somar em TS) mantém a
  // resposta em `dias` linhas por mais que a fábrica cresça.
  //
  // `sql.raw` não é descuido: o fuso PRECISA virar texto literal na query. Como
  // parâmetro ligado, as duas ocorrências viram placeholders DIFERENTES ($1 no
  // select, $2 no group by), o Postgres não reconhece as duas expressões como a
  // mesma e a query morre com 42803 ("must appear in the GROUP BY clause").
  // Interpolar é seguro aqui porque `FUSO_BRASIL` é constante do código, nunca
  // entrada de usuário.
  const diaEmBrasiliaSQL = sql<string>`to_char(${apontamentosProducao.inicio} AT TIME ZONE ${sql.raw(`'${FUSO_BRASIL}'`)}, 'YYYY-MM-DD')`

  const rows = await db
    .select({
      // MESMO fragmento no select e no group by, de propósito: eram duas
      // strings iguais copiadas, e duas cópias divergem quando alguém mexe
      // numa só.
      dia: diaEmBrasiliaSQL,
      produzido: sql<number>`coalesce(sum(${apontamentosProducao.quantidadeProduzida}), 0)::int`,
      refugo: sql<number>`coalesce(sum(${apontamentosProducao.quantidadeRefugo}), 0)::int`,
    })
    .from(apontamentosProducao)
    .where(gte(apontamentosProducao.inicio, inicio))
    .groupBy(diaEmBrasiliaSQL)

  // Preenche dias sem apontamento com zero pra linha não ficar com gaps.
  // `somarDias` é aritmética de calendário pura: as chaves saem iguais às que
  // o `to_char` acima produz, sem passar por fuso de novo.
  const map = new Map(rows.map((r) => [r.dia, r]))
  const serie: ProducaoDia[] = []
  for (let i = 0; i < dias; i++) {
    const key = somarDias(primeiroDia, i)
    const r = map.get(key)
    serie.push({
      dia: key,
      produzido: r?.produzido ?? 0,
      refugo: r?.refugo ?? 0,
    })
  }
  return serie
}

// -----------------------------------------------------------------
// OPs ativas por canal de destino
// -----------------------------------------------------------------

export type OpsPorCanal = {
  canal: (typeof canalValues)[number]
  total: number
  unidades: number
}

export async function listarOpsPorCanal(): Promise<OpsPorCanal[]> {
  await requireAuth()

  const rows = await db
    .select({
      canal: ordensProducao.canalDestino,
      total: sql<number>`count(*)::int`,
      unidades: sql<number>`coalesce(sum(${ordensProducao.quantidade}), 0)::int`,
    })
    .from(ordensProducao)
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.status, 'cancelado'),
      ),
    )
    .groupBy(ordensProducao.canalDestino)

  return rows
}

// -----------------------------------------------------------------
// Top produtos do mês (por unidades em OPs criadas no mês corrente)
// -----------------------------------------------------------------

export type TopProdutoItem = {
  produtoId: string
  produtoNome: string
  produtoSku: string
  unidades: number
  ops: number
}

export async function listarTopProdutosMes(
  limit = 5,
): Promise<TopProdutoItem[]> {
  await requireAuth()

  const inicioMes = inicioDoMes()

  const rows = await db
    .select({
      produtoId: produtos.id,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      unidades: sql<number>`coalesce(sum(${ordensProducao.quantidade}), 0)::int`,
      ops: sql<number>`count(${ordensProducao.id})::int`,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.status, 'cancelado'),
        gte(ordensProducao.createdAt, inicioMes),
      ),
    )
    .groupBy(produtos.id, produtos.nome, produtos.sku)
    .orderBy(desc(sql`sum(${ordensProducao.quantidade})`))
    .limit(limit)

  return rows
}
