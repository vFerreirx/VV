import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Catálogo de tamanhos (P, M, G, GG, Solteiro, Casal, Queen, King…).
// `ordem` permite controlar a sequência em selects (ex: P antes de M antes de G).
export const tamanhos = pgTable(
  'tamanhos',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull().unique(),
    // Código usado no SKU da variação (ex.: KING -> "K", Manta -> "MANTA").
    codigo: text(),
    ordem: integer().notNull().default(0),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('tamanhos_ativo_idx').on(table.ativo)],
)

export type Tamanho = typeof tamanhos.$inferSelect
export type NewTamanho = typeof tamanhos.$inferInsert
