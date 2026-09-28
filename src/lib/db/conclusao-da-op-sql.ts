import { gte, sql } from 'drizzle-orm'

import { eventosKanban } from '@/lib/db/schema'

// OS PEDAÇOS DE SQL DA CONCLUSÃO — separados de conclusao-da-op.ts porque lá
// tem 'server-only' e o `db`, e estes precisam ser testáveis SEM BANCO
// (conclusao-da-op-sql.test.ts compila o fragmento e confere os parâmetros).
// Só dependem do schema. Quem usa importa de conclusao-da-op.ts, que
// reexporta.

export const comTransicao = sql`${eventosKanban.statusAnterior} IS DISTINCT FROM ${eventosKanban.statusNovo}`

// OS DOIS PEDAÇOS DE SQL DA JANELA DE 24 H — o quadro e o tablet filtram no
// banco, não em memória: sem isto o tablet lia toda OP da estação desde
// sempre a cada recarga. O instante de corte vem de fora
// (`inicioDaJanela`, destino-da-ordem.ts), então as 24 h não estão escritas
// aqui. ⚠️ Correlacionados com "ordens_producao"."id" QUALIFICADO À MÃO —
// sem isso o Postgres casa com o `id` do próprio eventos_kanban.

/** A OP teve uma conclusão (com transição) a partir de `desde`? */
export function concluidaDesdeSql(desde: Date) {
  // ⚠️ `gte(coluna, desde)`, NUNCA `${coluna} >= ${desde}`. Date dentro de
  // sql`` quebra EM RUNTIME (Drizzle + postgres-js): o driver troca o
  // serializer dos timestamps pela identidade, o Date chega cru no postgres.js
  // e ele lança "The "string" argument must be of type string ... Received an
  // instance of Date". Pela coluna, o valor passa pelo mapToDriverValue dela
  // e vira texto ISO. Type-check, lint e testes puros não pegam — foi assim
  // que a aba Produção caiu pra todo mundo depois do PR #14.
  return sql<boolean>`EXISTS (
    SELECT 1 FROM ${eventosKanban}
    WHERE ${eventosKanban.ordemId} = "ordens_producao"."id"
      AND ${eventosKanban.statusNovo} = 'pronto_envio'
      AND ${comTransicao}
      AND ${gte(eventosKanban.createdAt, desde)}
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
