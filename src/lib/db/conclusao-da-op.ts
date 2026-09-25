import 'server-only'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { eventosKanban, users } from '@/lib/db/schema'
import type { StatusDaOrdem } from '@/lib/producao/destino-da-ordem'

// A CONCLUSÃO MAIS RECENTE DE CADA OP, E A ÚLTIMA TRANSIÇÃO — lidas do
// `eventos_kanban`. Quem usa: o desfazer (de onde a OP veio, quem concluiu,
// quais apontamentos são dela), o "Terminadas" do tablet (quando, quem, o
// resumo) e a ficha da OP (se o Desfazer ainda alcança — `desfazerAlcanca`).
// Eram três cópias da mesma consulta; agora é uma.
//
// ⚠️ SÓ EVENTO COM TRANSIÇÃO. O Corrigir quantidades, o Mudar destino e a
// edição de prazo gravam evento SEM transição (status anterior = novo), e
// numa OP de Full esperando despacho isso é `pronto_envio → pronto_envio`.
// Contado como conclusão, o tablet mostraria autor e hora da CORREÇÃO, e o
// desfazer procuraria apontamentos a partir dela — e não acharia nenhum.
// `IS DISTINCT FROM` e não `<>`: o evento de criação tem anterior NULO.
//
// ⚠️ NO MESMO INSTANTE, A FINALIZAÇÃO É A ÚLTIMA. Conclusão e finalização
// nascem na mesma transação, com o mesmo `created_at` (`posicaoNoMesmoInstante`,
// transicoes-da-op.ts); sem o desempate a "última transição" podia sair a
// conclusão, e o desfazer acharia que a OP não está finalizada pela conclusão.

type Executor = Pick<typeof db, 'select'>

export type ConclusaoDaOp = {
  em: Date
  /** De onde a OP veio (`status_anterior`) — pra onde o desfazer devolve. */
  de: StatusDaOrdem | null
  porId: string | null
  porNome: string | null
  /** O resumo que a conclusão gravou. */
  resumo: string | null
}

export type MarcosDaOp = {
  conclusao: ConclusaoDaOp | null
  ultimaTransicao: { para: StatusDaOrdem; em: Date } | null
}

const comTransicao = sql`${eventosKanban.statusAnterior} IS DISTINCT FROM ${eventosKanban.statusNovo}`

// OS DOIS PEDAÇOS DE SQL DA JANELA DE 24 H — o quadro e o tablet filtram no
// banco, não em memória: sem isto o tablet lia toda OP da estação desde
// sempre a cada recarga. O instante de corte vem de fora
// (`inicioDaJanela`, destino-da-ordem.ts), então as 24 h não estão escritas
// aqui. ⚠️ Correlacionados com "ordens_producao"."id" QUALIFICADO À MÃO —
// sem isso o Postgres casa com o `id` do próprio eventos_kanban.

/** A OP teve uma conclusão (com transição) a partir de `desde`? */
export function concluidaDesdeSql(desde: Date) {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM ${eventosKanban}
    WHERE ${eventosKanban.ordemId} = "ordens_producao"."id"
      AND ${eventosKanban.statusNovo} = 'pronto_envio'
      AND ${comTransicao}
      AND ${eventosKanban.createdAt} >= ${desde}
  )`
}

/** Quando foi a conclusão mais recente da OP, ou NULL. */
export const concluidaEmSql = sql<string | null>`(
  SELECT MAX(${eventosKanban.createdAt})
  FROM ${eventosKanban}
  WHERE ${eventosKanban.ordemId} = "ordens_producao"."id"
    AND ${eventosKanban.statusNovo} = 'pronto_envio'
    AND ${comTransicao}
)`

/** Os marcos de várias OPs, em duas consultas. */
export async function marcosDasOps(
  ids: readonly string[],
  executor: Executor = db,
): Promise<Map<string, MarcosDaOp>> {
  const mapa = new Map<string, MarcosDaOp>()
  if (ids.length === 0) return mapa
  for (const id of ids) mapa.set(id, { conclusao: null, ultimaTransicao: null })

  const [conclusoes, transicoes] = await Promise.all([
    executor
      .select({
        ordemId: eventosKanban.ordemId,
        em: eventosKanban.createdAt,
        de: eventosKanban.statusAnterior,
        porId: eventosKanban.usuarioId,
        porNome: users.nome,
        resumo: eventosKanban.observacao,
      })
      .from(eventosKanban)
      .leftJoin(users, eq(users.id, eventosKanban.usuarioId))
      .where(
        and(
          inArray(eventosKanban.ordemId, [...ids]),
          eq(eventosKanban.statusNovo, 'pronto_envio'),
          comTransicao,
        ),
      )
      .orderBy(desc(eventosKanban.createdAt)),
    executor
      .select({
        ordemId: eventosKanban.ordemId,
        em: eventosKanban.createdAt,
        para: eventosKanban.statusNovo,
      })
      .from(eventosKanban)
      .where(and(inArray(eventosKanban.ordemId, [...ids]), comTransicao))
      .orderBy(
        desc(eventosKanban.createdAt),
        desc(sql`${eventosKanban.statusNovo} = 'enviado'`),
      ),
  ])

  // Do mais novo pro mais velho: o primeiro de cada OP é o que vale. Uma OP
  // desfeita e concluída de novo tem duas conclusões.
  for (const c of conclusoes) {
    const m = mapa.get(c.ordemId)!
    if (m.conclusao === null) {
      m.conclusao = {
        em: c.em,
        de: c.de,
        porId: c.porId,
        porNome: c.porNome,
        resumo: c.resumo,
      }
    }
  }
  for (const t of transicoes) {
    const m = mapa.get(t.ordemId)!
    if (m.ultimaTransicao === null) m.ultimaTransicao = { para: t.para, em: t.em }
  }
  return mapa
}

export async function marcosDaOp(
  ordemId: string,
  executor: Executor = db,
): Promise<MarcosDaOp> {
  return (
    (await marcosDasOps([ordemId], executor)).get(ordemId) ?? {
      conclusao: null,
      ultimaTransicao: null,
    }
  )
}
