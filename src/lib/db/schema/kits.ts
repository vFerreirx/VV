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

import { produtos } from './produtos'

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

// Itens (componentes) de um kit: cada um aponta pro PRODUTO + quantidade
// por kit. Tamanho/cor (a variação) são escolhidos só ao gerar as OPs.
export const kitItens = pgTable(
  'kit_itens',
  {
    id: uuid().primaryKey().defaultRandom(),
    kitId: uuid()
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id),
    quantidade: integer().notNull().default(1),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [index('kit_itens_kit_idx').on(table.kitId)],
)

// Preço FECHADO do kit de ATACADO, por COMBINAÇÃO de tamanhos — ver
// supabase/sql/47_preco_marketplace.sql.
//
// ⚠️ Não confunda com `kitTamanhoPrecoMarketplace` (schema/precos-marketplace.ts):
// as duas são irmãs, e só ESTA alimenta o pedido.
//
// A chave é `combinacao`, e não um `tamanho_id`: o preço depende do tamanho
// de TODOS os componentes variáveis ao mesmo tempo (o Kit ACONCHEGO muda de
// preço com o tamanho da capa E o da peseira). Quem monta a string é
// `chaveDeTamanhos` em src/lib/kit-tamanhos.ts — nunca à mão. '' é chave
// válida: kit sem componente variável tem um preço só.
//
// Opcional: kit sem linha aqui cai na soma dos componentes, que é o caso
// normal. A linha só existe pra kit cujo preço DIFERE da soma (combo com
// desconto); repetir a soma seria dado inerte com aparência de regra.
export const kitTamanhoPreco = pgTable(
  'kit_tamanho_preco',
  {
    id: uuid().primaryKey().defaultRandom(),
    kitId: uuid()
      .notNull()
      .references(() => kits.id, { onDelete: 'cascade' }),
    combinacao: text().notNull(),
    preco: numeric({ precision: 12, scale: 2 }).notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    unique('kit_tamanho_preco_uk').on(table.kitId, table.combinacao),
    index('kit_tamanho_preco_kit_idx').on(table.kitId),
  ],
)

export type Kit = typeof kits.$inferSelect
export type NewKit = typeof kits.$inferInsert
export type KitItem = typeof kitItens.$inferSelect
export type NewKitItem = typeof kitItens.$inferInsert
export type KitTamanhoPreco = typeof kitTamanhoPreco.$inferSelect
export type NewKitTamanhoPreco = typeof kitTamanhoPreco.$inferInsert
