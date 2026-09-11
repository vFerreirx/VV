import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { maquinaStatusEnum } from './enums'
import { users } from './users'

// Máquinas (teares / máquinas de costura). operador_atual_id referencia
// public.users — a FK é adicionada via SQL na Fase 2 pra evitar import circular.
export const maquinas = pgTable(
  'maquinas',
  {
    id: uuid().primaryKey().defaultRandom(),
    codigo: text().notNull().unique(),
    nome: text().notNull(),

    status: maquinaStatusEnum().notNull().default('parada'),
    operadorAtualId: uuid(),
    // Estação (grupo) à qual a máquina pertence. FK via SQL.
    estacaoId: uuid(),

    observacoes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('maquinas_status_idx').on(table.status)],
)

export type Maquina = typeof maquinas.$inferSelect
export type NewMaquina = typeof maquinas.$inferInsert

// ─────────────────────────────────────────────────────────────────────────
// HISTÓRICO DE PARADAS
// ─────────────────────────────────────────────────────────────────────────
//
// Uma linha por parada, com abertura e fechamento — NÃO é append-only como
// `eventos_kanban`. O porquê (e todas as regras que o banco defende) está no
// topo de supabase/sql/57_maquina_paradas.sql.
//
// ⚠️ ESTA DECLARAÇÃO NÃO CRIA A TABELA. Quem cria é o 57, porque o Drizzle
// não expressa o que dá musculatura a ela: os CHECKs, as policies de RLS e o
// índice único PARCIAL de "no máximo uma parada aberta por máquina". Aqui é
// só a forma, pra que as queries sejam tipadas — mesmo arranjo de
// `orcamentoParcelas` (55). Ao mexer numa, mexa na outra.
export const maquinaParadas = pgTable(
  'maquina_paradas',
  {
    id: uuid().primaryKey().defaultRandom(),
    maquinaId: uuid()
      .notNull()
      .references(() => maquinas.id, { onDelete: 'cascade' }),

    // Qual impedimento causou. O CHECK no banco só aceita os três que
    // IMPEDEM produzir ('manutencao', 'setup', 'desativada').
    status: maquinaStatusEnum().notNull(),

    // Nulo é caso normal: `setup` e `desativada` vêm do formulário de
    // cadastro, sem diálogo de motivo. A lista de valores vive em
    // src/lib/producao/parada-de-maquina.ts e tem cópia no CHECK do banco.
    motivo: text(),
    observacaoAbertura: text(),

    // ⚠️ SEM `createdAt` ao lado. Nenhuma tela registra parada com hora de
    // trás, então uma segunda data seria outro campo pra mesma verdade — e é
    // assim que dois campos saem de sincronia.
    iniciadaEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    abertaPor: uuid().references(() => users.id),

    // Nulo = a máquina AINDA está parada. Sem booleano separado de propósito.
    encerradaEm: timestamp({ withTimezone: true }),
    encerradaPor: uuid().references(() => users.id),
    observacaoFechamento: text(),

    // ⚠️ SNAPSHOT, e a FK vive só no SQL: declarar `.references(ordensProducao)`
    // aqui faria maquinas.ts importar ordens.ts, que já importa maquinas.ts —
    // o mesmo ciclo que o comentário do topo deste arquivo descreve. No banco
    // a FK existe, e DE PROPÓSITO sem ON DELETE CASCADE: apagar a OP não pode
    // apagar a parada.
    ordemId: uuid(),
  },
  (table) => [
    // O índice de leitura do histórico. O ÚNICO PARCIAL (uma parada aberta
    // por máquina) fica só no 57: Drizzle não expressa `WHERE`.
    index('maquina_paradas_maquina_idx').on(table.maquinaId, table.iniciadaEm),
  ],
)

export type MaquinaParada = typeof maquinaParadas.$inferSelect
export type NewMaquinaParada = typeof maquinaParadas.$inferInsert
