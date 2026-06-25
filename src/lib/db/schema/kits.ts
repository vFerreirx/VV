import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { variacoesProduto } from './produtos'

// Kit = combo de venda (ex.: 1 peseira + 2 capas). Vendido junto, mas
// para a produção é explodido em itens unitários (uma OP por componente).
export const kits = pgTable(
  'kits',
  {
    id: uuid().primaryKey().defaultRandom(),
    sku: text().notNull(),
    nome: text().notNull(),
    descricao: text(),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('kits_ativo_idx').on(table.ativo),
    uniqueIndex('kits_sku_ativo_uidx')
      .on(table.sku)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

// Itens (componentes) de um kit: cada um aponta pra uma variação de
// produto + quantidade por kit.
export const kitItens = pgTable(
  'kit_itens',
  {
    id: uuid().primaryKey().defaultRandom(),
    kitId: uuid()
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    variacaoId: uuid()
      .notNull()
      .references(() => variacoesProduto.id),
    quantidade: integer().notNull().default(1),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [index('kit_itens_kit_idx').on(table.kitId)],
)

export type Kit = typeof kits.$inferSelect
export type NewKit = typeof kits.$inferInsert
export type KitItem = typeof kitItens.$inferSelect
export type NewKitItem = typeof kitItens.$inferInsert
