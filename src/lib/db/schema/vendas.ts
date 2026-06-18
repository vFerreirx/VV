import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { produtos, variacoesProduto } from './produtos'
import { users } from './users'

// Registro manual de vendas diárias. NÃO mexe no estoque — é só um
// histórico do que foi vendido por dia/canal.
export const vendas = pgTable(
  'vendas',
  {
    id: uuid().primaryKey().defaultRandom(),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id),
    variacaoId: uuid().references(() => variacoesProduto.id),

    quantidade: integer().notNull(),
    // 'full_ml' | 'full_shopee' | 'venda_direta'
    canal: text().notNull(),
    // Dia da venda (sem hora).
    data: date().notNull(),
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
    index('vendas_canal_idx').on(table.canal),
  ],
)

export type Venda = typeof vendas.$inferSelect
export type NewVenda = typeof vendas.$inferInsert
