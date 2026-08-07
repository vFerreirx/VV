import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { tamanhos } from './tamanhos'

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

    // NOTA: o peso migrou pro par (produto, tamanho) — `produtoTamanhoPeso`
    // logo abaixo, criada em supabase/sql/40_peso_produto_tamanho.sql. Um
    // peso por PRODUTO não conseguia dizer a qual tamanho se referia: a
    // Peseira existe em Casal, King e Queen e cada uma pesa o seu. A coluna
    // peso_gramas continua no banco por histórico (é de onde a migration
    // copiou), mas o app não a lê nem escreve mais — mesmo tratamento dado a
    // largura_cm/comprimento_cm acima.

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

// Preço de TABELA do par (produto, tamanho) — ver supabase/sql/38_precos.sql.
// É o preço do catálogo, não o do pedido: `orcamento_itens.preco_unitario`
// continua sendo snapshot do negociado e não muda quando este aqui muda.
//
// Sem `deletedAt` de propósito: preço não é entidade de cadastro, é um valor
// do par. Tirar o preço é apagar a linha.
export const produtoTamanhoPreco = pgTable(
  'produto_tamanho_preco',
  {
    id: uuid().primaryKey().defaultRandom(),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id, { onDelete: 'cascade' }),
    tamanhoId: uuid()
      .notNull()
      .references(() => tamanhos.id),
    preco: numeric({ precision: 12, scale: 2 }).notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    unique('produto_tamanho_preco_uk').on(table.produtoId, table.tamanhoId),
    index('produto_tamanho_preco_produto_idx').on(table.produtoId),
  ],
)

// Peso do par (produto, tamanho) — ver supabase/sql/40_peso_produto_tamanho.sql.
// Espelho exato da `produtoTamanhoPreco` acima, de propósito: peso e preço
// têm o mesmo eixo e não faria sentido inventar outra forma pra cada um.
//
// A diferença é o NOT NULL: "sem peso" é a ausência da linha, não uma linha
// com null. E o peso continua NÃO sendo congelado no pedido (ver o topo de
// src/lib/peso.ts) — ao contrário do preço, que é snapshot.
export const produtoTamanhoPeso = pgTable(
  'produto_tamanho_peso',
  {
    id: uuid().primaryKey().defaultRandom(),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id, { onDelete: 'cascade' }),
    tamanhoId: uuid()
      .notNull()
      .references(() => tamanhos.id),
    pesoGramas: integer().notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    unique('produto_tamanho_peso_uk').on(table.produtoId, table.tamanhoId),
    index('produto_tamanho_peso_produto_idx').on(table.produtoId),
  ],
)

export type Produto = typeof produtos.$inferSelect
export type NewProduto = typeof produtos.$inferInsert
export type VariacaoProduto = typeof variacoesProduto.$inferSelect
export type NewVariacaoProduto = typeof variacoesProduto.$inferInsert
export type ProdutoTamanhoPreco = typeof produtoTamanhoPreco.$inferSelect
export type NewProdutoTamanhoPreco = typeof produtoTamanhoPreco.$inferInsert
export type ProdutoTamanhoPeso = typeof produtoTamanhoPeso.$inferSelect
export type NewProdutoTamanhoPeso = typeof produtoTamanhoPeso.$inferInsert
