import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Catálogo de cores reutilizáveis. Ao criar variações de produto, a cor
// é selecionada deste cadastro (mas armazenada como texto na variação,
// preservando o histórico mesmo se a cor for renomeada/inativada).
export const cores = pgTable(
  'cores',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull().unique(),
    // Hexadecimal opcional (#RRGGBB) pra renderizar swatch visual.
    codigoHex: text(),
    // Segunda tonalidade opcional, pra cores bicolor (ex.: capa listrada).
    // Quando presente, o swatch é renderizado dividido entre as duas cores.
    codigoHex2: text(),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('cores_ativo_idx').on(table.ativo)],
)

export type Cor = typeof cores.$inferSelect
export type NewCor = typeof cores.$inferInsert
