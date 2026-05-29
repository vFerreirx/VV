import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { maquinaStatusEnum } from './enums'

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
