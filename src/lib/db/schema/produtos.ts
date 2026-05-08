import { sql } from 'drizzle-orm'
import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Catálogo de produtos da malharia (malhas).
// Versão enxuta: só os campos essenciais. Preços/custos/estoque mínimo
// foram removidos — virão depois quando o cálculo de margem for definido.
export const produtos = pgTable(
  'produtos',
  {
    id: uuid().primaryKey().defaultRandom(),
    sku: text().notNull().unique(),
    nome: text().notNull(),
    descricao: text(),

    // gramatura em g/m²
    gramatura: numeric({ precision: 8, scale: 2 }),
    // largura útil da malha em cm
    larguraCm: numeric({ precision: 8, scale: 2 }),
    // rendimento em kg por metro linear — usado pra calcular metragem da OP
    rendimentoKgPorMetro: numeric({ precision: 10, scale: 4 }),

    // Identificadores externos (preenchidos quando integrar com ML/Shopee)
    mlbId: text(),
    shopeeItemId: text(),

    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('produtos_ativo_idx').on(table.ativo)],
)

export const variacoesProduto = pgTable(
  'variacoes_produto',
  {
    id: uuid().primaryKey().defaultRandom(),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id, { onDelete: 'cascade' }),
    skuVariacao: text().notNull().unique(),
    cor: text(),
    tamanho: text(),
    precoAdicional: numeric({ precision: 12, scale: 2 }).default('0'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [index('variacoes_produto_id_idx').on(table.produtoId)],
)

export type Produto = typeof produtos.$inferSelect
export type NewProduto = typeof produtos.$inferInsert
export type VariacaoProduto = typeof variacoesProduto.$inferSelect
export type NewVariacaoProduto = typeof variacoesProduto.$inferInsert
