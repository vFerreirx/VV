import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// Catálogo de tamanhos (P, M, G, GG, Solteiro, Casal, Queen, King…).
// `ordem` permite controlar a sequência em selects (ex: P antes de M antes de G).
export const tamanhos = pgTable(
  'tamanhos',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull().unique(),
    // Código usado no SKU da variação (ex.: KING -> "K", Manta -> "MANTA").
    codigo: text(),
    // Dimensões da peça deste tamanho (ex.: 45x45 -> largura 45, compr. 45).
    larguraCm: numeric({ precision: 8, scale: 2 }),
    comprimentoCm: numeric({ precision: 8, scale: 2 }),
    // Peso PADRÃO da peça deste tamanho, em gramas inteiras. É a fonte
    // principal do peso usado no frete; o produto só entra quando o modelo
    // foge do padrão (produtos.pesoGramas). Nulo = ainda não cadastrado, o
    // que NÃO é o mesmo que zero.
    pesoGramas: integer(),
    ordem: integer().notNull().default(0),
    // 'casa' | 'vestuario' (CHECK na 72). O produto diz de qual grupo é, e a
    // tela dele só oferece os tamanhos do grupo — ver
    // src/lib/produtos/grupo-de-tamanho.ts.
    grupo: text().notNull().default('casa'),
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
