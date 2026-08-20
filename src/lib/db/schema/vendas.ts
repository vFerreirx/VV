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
// dia + observação. Um registro por dia (índice único). Os totais são a
// soma do detalhamento por conta de marketplace (vendas_marketplace).
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

// Detalhamento das vendas do dia por conta de marketplace.
// `conta` é a chave estável da conta (ex.: 'ml_1', 'shopee_2', 'temu') e
// `marketplace` o agrupador (ex.: 'mercado_livre'), conforme o catálogo
// em src/lib/validators/vendas.ts. Uma linha por conta com venda no dia.
export const vendasMarketplace = pgTable(
  'vendas_marketplace',
  {
    id: uuid().primaryKey().defaultRandom(),
    vendaId: uuid()
      .notNull()
      .references(() => vendas.id, { onDelete: 'cascade' }),
    marketplace: text().notNull(),
    conta: text().notNull(),
    quantidade: integer().notNull().default(0),
    faturamento: numeric({ precision: 12, scale: 2 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    index('vendas_marketplace_venda_idx').on(table.vendaId),
    uniqueIndex('vendas_marketplace_venda_conta_idx').on(
      table.vendaId,
      table.conta,
    ),
  ],
)

export type VendaMarketplace = typeof vendasMarketplace.$inferSelect
export type NewVendaMarketplace = typeof vendasMarketplace.$inferInsert
