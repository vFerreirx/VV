import { sql } from 'drizzle-orm'
import { index, numeric, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { kits } from './kits'
import { produtos } from './produtos'
import { tamanhos } from './tamanhos'

// ⚠️ PREÇO DE MARKETPLACE — NÃO É O PREÇO DO PEDIDO.
//
// Estas duas tabelas são IRMÃS de `produtoTamanhoPreco` e `kitTamanhoPreco`
// (schema/produtos.ts e schema/kits.ts): mesmas colunas, mesmos tipos, nomes
// quase iguais. O pedido lê AQUELAS, sempre. Nunca estas.
//
// A regra inteira, com o porquê, está no topo de src/lib/preco-marketplace.ts.
// Leia antes de importar qualquer coisa daqui.
//
// Migration: supabase/sql/47_preco_marketplace.sql.

// Preço de anúncio de um par (produto, tamanho) num CANAL.
export const produtoTamanhoPrecoMarketplace = pgTable(
  'produto_tamanho_preco_marketplace',
  {
    id: uuid().primaryKey().defaultRandom(),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id, { onDelete: 'cascade' }),
    // Sem cascata, igual à de atacado: apagar tamanho com preço cadastrado
    // deve falhar e doer, não esvaziar a tabela em silêncio.
    tamanhoId: uuid()
      .notNull()
      .references(() => tamanhos.id),
    // O CANAL, não a conta. Chaves de `MARKETPLACE_LABEL`
    // (src/lib/validators/vendas.ts) — o mesmo vocabulário de
    // `vendas_marketplace.marketplace`. `contas_marketplace` é outra coisa:
    // é por conta e serve às remessas Full.
    marketplace: text().notNull(),
    preco: numeric({ precision: 12, scale: 2 }).notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    unique('produto_tamanho_preco_mkt_uk').on(table.produtoId, table.tamanhoId, table.marketplace),
    index('produto_tamanho_preco_mkt_canal_idx').on(table.marketplace),
  ],
)

// Preço de anúncio de um kit numa COMBINAÇÃO de tamanhos, num canal.
//
// A chave é a mesma da tabela de atacado — `chaveDeTamanhos` em
// src/lib/kit-tamanhos.ts. As duas TÊM que usar a mesma regra: se
// divergirem, um preço cadastrado vira inalcançável sem ninguém perceber.
export const kitTamanhoPrecoMarketplace = pgTable(
  'kit_tamanho_preco_marketplace',
  {
    id: uuid().primaryKey().defaultRandom(),
    kitId: uuid()
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    combinacao: text().notNull(),
    marketplace: text().notNull(),
    preco: numeric({ precision: 12, scale: 2 }).notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    unique('kit_tamanho_preco_mkt_uk').on(table.kitId, table.combinacao, table.marketplace),
    index('kit_tamanho_preco_mkt_canal_idx').on(table.marketplace),
  ],
)

export type ProdutoTamanhoPrecoMarketplace = typeof produtoTamanhoPrecoMarketplace.$inferSelect
export type NewProdutoTamanhoPrecoMarketplace = typeof produtoTamanhoPrecoMarketplace.$inferInsert
export type KitTamanhoPrecoMarketplace = typeof kitTamanhoPrecoMarketplace.$inferSelect
export type NewKitTamanhoPrecoMarketplace = typeof kitTamanhoPrecoMarketplace.$inferInsert
