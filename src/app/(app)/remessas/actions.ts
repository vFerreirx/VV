'use server'

import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  apontamentosProducao,
  ordensProducao,
  produtos,
  remessasFull,
  users,
  variacoesProduto,
} from '@/lib/db/schema'
import { STATUS_KANBAN, statusValues } from '@/lib/validators/ordens'

// Quantos dias (ou menos) faltando pro prazo já viram "em risco" (amarelo),
// enquanto a remessa não estiver pronta. Confirmado com o usuário.
const RISCO_DIAS = 2

// STATUS_KANBAN é tipado como (typeof statusValues)[number][] (perde a
// literal narrowing pro TS), mas em runtime só tem essas 6 etapas — cast
// local pra type-check nas contagens por etapa.
export type EtapaKanban = Exclude<
  (typeof statusValues)[number],
  'enviado' | 'cancelado'
>
const ETAPAS_KANBAN = STATUS_KANBAN as EtapaKanban[]

export type EtapaContagem = {
  status: EtapaKanban
  count: number
}

export type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }

// OP ATIVA = não excluída e não cancelada. Mesma definição usada pra montar
// a lista de remessas abertas e pra decidir se uma remessa pode ser excluída.
const opAtiva = and(
  isNull(ordensProducao.deletedAt),
  ne(ordensProducao.status, 'cancelado'),
)

export type RemessaAberta = {
  id: string
  canal: 'full_ml' | 'full_shopee'
  dataEnvio: string
  ops: number
  opsProntas: number
  unidades: number
  produzidas: number
  atrasadas: number
  pronta: boolean
  etapas: EtapaContagem[]
  // Etapa mais atrás do fluxo que ainda tem OP parada (null = remessa pronta).
  gargalo: EtapaKanban | null
  diasRestantes: number
  risco: 'no_prazo' | 'em_risco' | 'atrasada'
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAte(dataEnvio: string): number {
  const hoje = hojeISO()
  return Math.round(
    (Date.parse(`${dataEnvio}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) /
      86_400_000,
  )
}

// Remessas Full ABERTAS (alguma OP não-cancelada ainda não enviada), com
// progresso agregado em UMA query (GROUP BY) — nada de query por remessa.
export async function listarRemessasAbertas(): Promise<RemessaAberta[]> {
  await requireArea('remessas')

  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      ops: sql<number>`count(*)::int`,
      opsProntas: sql<number>`count(*) filter (
        where ${ordensProducao.status} in ('pronto_envio', 'enviado')
      )::int`,
      pendentes: sql<number>`count(*) filter (
        where ${ordensProducao.status} <> 'enviado'
      )::int`,
      unidades: sql<number>`coalesce(sum(${ordensProducao.quantidade}), 0)::int`,
      // Qualifica "ordens_producao"."id" — a subquery é sobre
      // apontamentos_producao, que também tem `id` próprio (mesmo cuidado
      // do bug corrigido em produção/actions.ts).
      produzidas: sql<number>`coalesce(sum(
        LEAST(${ordensProducao.quantidade}, (
          SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)
          FROM ${apontamentosProducao}
          WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
        ))
      ), 0)::int`,
      atrasadas: sql<number>`count(*) filter (
        where ${ordensProducao.status} <> 'enviado'
          and ${ordensProducao.dataPrevistaFim} < now()
      )::int`,
      aguardandoMateriaPrima: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'aguardando_materia_prima'
      )::int`,
      programado: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'programado'
      )::int`,
      emProducao: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'em_producao'
      )::int`,
      acabamento: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'acabamento'
      )::int`,
      embalagem: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'embalagem'
      )::int`,
      prontoEnvio: sql<number>`count(*) filter (
        where ${ordensProducao.status} = 'pronto_envio'
      )::int`,
    })
    .from(remessasFull)
    .innerJoin(
      ordensProducao,
      and(
        eq(ordensProducao.remessaFullId, remessasFull.id),
        opAtiva,
      ),
    )
    .where(isNull(remessasFull.deletedAt))
    .groupBy(remessasFull.id, remessasFull.canal, remessasFull.dataEnvio)
    .orderBy(asc(remessasFull.dataEnvio))

  const contagemPorEtapa = {
    aguardando_materia_prima: 'aguardandoMateriaPrima',
    programado: 'programado',
    em_producao: 'emProducao',
    acabamento: 'acabamento',
    embalagem: 'embalagem',
    pronto_envio: 'prontoEnvio',
  } as const satisfies Record<EtapaKanban, string>

  return rows
    .filter((r) => r.pendentes > 0)
    .map((r): RemessaAberta => {
      const etapas: EtapaContagem[] = ETAPAS_KANBAN.map((status) => ({
        status,
        count: r[contagemPorEtapa[status] as keyof typeof r] as number,
      }))
      const pronta = r.ops === r.opsProntas
      const gargalo = pronta
        ? null
        : (etapas.find((e) => e.count > 0)?.status ?? null)
      const diasRestantes = diasAte(r.dataEnvio)
      const risco: RemessaAberta['risco'] = pronta
        ? 'no_prazo'
        : diasRestantes < 0
          ? 'atrasada'
          : diasRestantes <= RISCO_DIAS
            ? 'em_risco'
            : 'no_prazo'

      return {
        id: r.id,
        canal: r.canal as 'full_ml' | 'full_shopee',
        dataEnvio: r.dataEnvio,
        ops: r.ops,
        opsProntas: r.opsProntas,
        unidades: r.unidades,
        produzidas: r.produzidas,
        atrasadas: r.atrasadas,
        pronta,
        etapas,
        gargalo,
        diasRestantes,
        risco,
      }
    })
}

export type OpDaRemessa = {
  id: string
  numero: string
  remessaFullId: string
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoTamanho: string | null
  quantidade: number
  produzido: number
  status: (typeof statusValues)[number]
  responsavelNome: string | null
  atrasada: boolean
}

// OPs de um conjunto de remessas, numa query só (evita N+1 ao expandir cada
// card no client).
export async function listarOpsDasRemessas(
  remessaIds: string[],
): Promise<OpDaRemessa[]> {
  await requireArea('remessas')
  if (remessaIds.length === 0) return []

  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      remessaFullId: ordensProducao.remessaFullId,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoTamanho: variacoesProduto.tamanho,
      quantidade: ordensProducao.quantidade,
      status: ordensProducao.status,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      responsavelNome: users.nome,
      // Mesma qualificação manual de "ordens_producao"."id" usada no kanban.
      produzido: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .where(
      and(
        inArray(ordensProducao.remessaFullId, remessaIds),
        opAtiva,
      ),
    )
    .orderBy(asc(ordensProducao.status), asc(ordensProducao.numero))

  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    remessaFullId: r.remessaFullId!,
    produtoNome: r.produtoNome,
    produtoSku: r.produtoSku,
    variacaoCor: r.variacaoCor ?? null,
    variacaoTamanho: r.variacaoTamanho ?? null,
    quantidade: r.quantidade,
    produzido: r.produzido,
    status: r.status,
    responsavelNome: r.responsavelNome ?? null,
    atrasada:
      r.dataPrevistaFim !== null &&
      r.status !== 'enviado' &&
      new Date(r.dataPrevistaFim).getTime() < now,
  }))
}

// -----------------------------------------------------------------
// Remessas encalhadas + exclusão
// -----------------------------------------------------------------

export type RemessaSemOp = {
  id: string
  canal: 'full_ml' | 'full_shopee'
  dataEnvio: string
  envioId: string | null
  // OPs que existiram e foram excluídas ou canceladas. Zero = remessa criada
  // e nunca usada.
  opsInativas: number
}

// Remessa sem NENHUMA OP ativa. Ela não aparece na lista de abertas (que
// exige OP pendente), então antes disso ficava invisível pra sempre — e como
// a trava de duplicidade da importação Full olha a remessa, o envio nunca
// mais podia ser reimportado. É exatamente o que esta lista destrava.
//
// ATENÇÃO ao "remessas_full"."id" escrito à mão: numa consulta de tabela
// única o Drizzle NÃO qualifica as colunas do select, então `${remessasFull.id}`
// sairia como `"id"` — e dentro da subconsulta o Postgres resolveria isso
// como `ordens_producao.id`, comparando a OP com ela mesma e devolvendo zero
// sempre. Mesmo cuidado já tomado no kanban e em listarOpsDasRemessas.
export async function listarRemessasSemOp(): Promise<RemessaSemOp[]> {
  await requireArea('remessas')

  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      envioId: remessasFull.envioId,
      ativas: sql<number>`(
        SELECT count(*) FROM ${ordensProducao} o
        WHERE o.remessa_full_id = "remessas_full"."id"
          AND o.deleted_at IS NULL AND o.status <> 'cancelado'
      )::int`,
      inativas: sql<number>`(
        SELECT count(*) FROM ${ordensProducao} o
        WHERE o.remessa_full_id = "remessas_full"."id"
          AND (o.deleted_at IS NOT NULL OR o.status = 'cancelado')
      )::int`,
    })
    .from(remessasFull)
    .where(isNull(remessasFull.deletedAt))
    .orderBy(desc(remessasFull.dataEnvio))

  return rows
    .filter((r) => r.ativas === 0)
    .map((r) => ({
      id: r.id,
      canal: r.canal as 'full_ml' | 'full_shopee',
      dataEnvio: r.dataEnvio,
      envioId: r.envioId,
      opsInativas: r.inativas,
    }))
}

// Exclusão SUAVE: a remessa vai pra lixeira, de onde dá pra restaurar ou
// apagar de vez. Só sai quando não tem OP ativa — senão o kanban perderia o
// agrupador das OPs que ainda estão sendo produzidas.
export async function excluirRemessaAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('remessas')

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  const [alvo] = await db
    .select({ id: remessasFull.id })
    .from(remessasFull)
    .where(and(eq(remessasFull.id, id), isNull(remessasFull.deletedAt)))
    .limit(1)
  if (!alvo) return { success: false, error: 'Remessa não encontrada' }

  const [agg] = await db
    .select({ ativas: sql<number>`count(*)::int` })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.remessaFullId, id), opAtiva))

  const ativas = agg?.ativas ?? 0
  if (ativas > 0) {
    return {
      success: false,
      error:
        `Essa remessa tem ${ativas} OP${ativas > 1 ? 's' : ''} ativa${ativas > 1 ? 's' : ''}. ` +
        'Exclua ou cancele essas OPs antes de excluir a remessa.',
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(remessasFull)
      .set({ deletedAt: new Date() })
      .where(and(eq(remessasFull.id, id), isNull(remessasFull.deletedAt)))
  })

  revalidatePath('/remessas')
  revalidatePath('/lixeira')
  return { success: true, message: 'Remessa enviada pra lixeira' }
}
