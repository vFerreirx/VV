import { sql } from 'drizzle-orm'
import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { contasMarketplace } from './contas-marketplace'

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
    // De QUAL CONTA é o envio. São 6 contas (3 ML, 3 Shopee), cada uma com um
    // CNPJ — "Full ML" em três contas diferentes é a informação faltando na
    // hora de separar o lote.
    //
    // ⚠️ NULL é caso NORMAL e permanente: os eventos de julho/2026 são de
    // antes de as contas existirem e vão continuar sem. Não é pendência de
    // preenchimento. Ver a migration 69.
    contaId: uuid().references(() => contasMarketplace.id, {
      onDelete: 'set null',
    }),
    observacao: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('eventos_full_data_idx').on(table.data),
    index('eventos_full_conta_idx')
      .on(table.contaId)
      .where(sql`${table.contaId} IS NOT NULL`),
  ],
)

export type EventoFull = typeof eventosFull.$inferSelect
export type NewEventoFull = typeof eventosFull.$inferInsert
