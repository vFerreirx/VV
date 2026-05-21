import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Catálogo de modelos reutilizáveis (desenho/estampa das peças produzidas:
// peseiras, capas de almofada, etc). Mesma estrutura de cores: armazenamos
// como texto na variação pra preservar histórico.
export const modelos = pgTable(
  'modelos',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull().unique(),
    descricao: text(),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('modelos_ativo_idx').on(table.ativo)],
)

export type Modelo = typeof modelos.$inferSelect
export type NewModelo = typeof modelos.$inferInsert
