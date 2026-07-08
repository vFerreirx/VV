import { sql } from 'drizzle-orm'
import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { ordemCanalEnum } from './enums'

// Remessa Full: agrupador de OPs por envio (Full ML/Shopee + data).
// As OPs criadas "dentro" do Full recebem remessa_full_id e herdam a
// data de envio como prazo (data_prevista_fim).
export const remessasFull = pgTable(
  'remessas_full',
  {
    id: uuid().primaryKey().defaultRandom(),
    canal: ordemCanalEnum().notNull(),
    dataEnvio: date().notNull(),
    observacao: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('remessas_full_data_idx').on(table.dataEnvio)],
)

export type RemessaFull = typeof remessasFull.$inferSelect
export type NewRemessaFull = typeof remessasFull.$inferInsert
