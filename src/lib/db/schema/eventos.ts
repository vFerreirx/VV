import { sql } from 'drizzle-orm'
import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Eventos de envio pro Full (Mercado Livre Full / Shopee Full).
// Registram quando um lote de estoque será enviado pro galpão do marketplace.
export const eventosFull = pgTable(
  'eventos_full',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Dia do envio (sem hora).
    data: date().notNull(),
    // 'full_ml' | 'full_shopee'
    canal: text().notNull(),
    observacao: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('eventos_full_data_idx').on(table.data)],
)

export type EventoFull = typeof eventosFull.$inferSelect
export type NewEventoFull = typeof eventosFull.$inferInsert
