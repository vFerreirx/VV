import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { users } from './users'

// Resumo de vendas POR DIA: total de unidades vendidas + faturamento do
// dia + observação. Um registro por dia (índice único).
export const vendas = pgTable(
  'vendas',
  {
    id: uuid().primaryKey().defaultRandom(),
    data: date().notNull(),
    quantidade: integer().notNull().default(0),
    faturamento: numeric({ precision: 12, scale: 2 }),
    observacao: text(),

    usuarioId: uuid().references(() => users.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('vendas_data_idx').on(table.data),
    uniqueIndex('vendas_data_unica_idx')
      .on(table.data)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type Venda = typeof vendas.$inferSelect
export type NewVenda = typeof vendas.$inferInsert
