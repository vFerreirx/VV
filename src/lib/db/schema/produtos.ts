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

// Catálogo de produtos. SKU é único apenas entre produtos NÃO excluídos
// (índice parcial) — assim o SKU de um produto excluído pode ser reusado.
export const produtos = pgTable(
  'produtos',
  {
    id: uuid().primaryKey().defaultRandom(),
    sku: text().notNull(),
    nome: text().notNull(),
    descricao: text(),

    // NOTA: as dimensões (largura/comprimento) migraram pro TAMANHO
    // (schema/tamanhos.ts). As colunas comprimento_cm/largura_cm ainda
    // existem no banco por histórico, mas o app não as usa mais.

    // OVERRIDE do peso do tamanho, em gramas inteiras. Só preencher quando
    // o modelo foge do padrão — hoje 7 modelos de capa dividem o tamanho
    // "45x45" e nem todos pesam igual. Nulo (o normal) = usa o peso do
    // tamanho.
    pesoGramas: integer(),

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
  (table) => [
    index('produtos_ativo_idx').on(table.ativo),
    uniqueIndex('produtos_sku_ativo_uidx')
      .on(table.sku)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export const variacoesProduto = pgTable(
  'variacoes_produto',
  {
    id: uuid().primaryKey().defaultRandom(),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id, { onDelete: 'cascade' }),
    skuVariacao: text().notNull(),
    // Texto armazenado (nome do item do catálogo) — preserva histórico
    // mesmo se a cor/modelo/tamanho for renomeado ou inativado.
    cor: text(),
    modelo: text(),
    tamanho: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    // Soft delete: acompanha o do produto pai. A linha continua existindo
    // (referências de OPs/movimentações intactas), mas libera o SKU.
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('variacoes_produto_id_idx').on(table.produtoId),
    uniqueIndex('variacoes_sku_ativo_uidx')
      .on(table.skuVariacao)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type Produto = typeof produtos.$inferSelect
export type NewProduto = typeof produtos.$inferInsert
export type VariacaoProduto = typeof variacoesProduto.$inferSelect
export type NewVariacaoProduto = typeof variacoesProduto.$inferInsert
