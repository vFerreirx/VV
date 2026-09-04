import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { orcamentos } from './orcamentos'
import { users } from './users'

// Resumo de vendas POR DIA: total de unidades vendidas + faturamento do
// dia + observação. Um registro por dia (índice único). Os totais são a
// soma do detalhamento por conta de marketplace (vendas_marketplace).
export const vendas = pgTable(
  'vendas',
  {
    id: uuid().primaryKey().defaultRandom(),
    data: date().notNull(),
    quantidade: integer().notNull().default(0),
    faturamento: numeric({ precision: 12, scale: 2 }),
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
    uniqueIndex('vendas_data_unica_idx')
      .on(table.data)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type Venda = typeof vendas.$inferSelect
export type NewVenda = typeof vendas.$inferInsert

// Detalhamento das vendas do dia por conta de marketplace.
// `conta` é a chave estável da conta (ex.: 'ml_1', 'shopee_2', 'temu') e
// `marketplace` o agrupador (ex.: 'mercado_livre'), conforme o catálogo
// em src/lib/validators/vendas.ts. Uma linha por conta com venda no dia.
export const vendasMarketplace = pgTable(
  'vendas_marketplace',
  {
    id: uuid().primaryKey().defaultRandom(),
    vendaId: uuid()
      .notNull()
      .references(() => vendas.id, { onDelete: 'cascade' }),
    marketplace: text().notNull(),
    conta: text().notNull(),
    quantidade: integer().notNull().default(0),
    faturamento: numeric({ precision: 12, scale: 2 }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    index('vendas_marketplace_venda_idx').on(table.vendaId),
    uniqueIndex('vendas_marketplace_venda_conta_idx').on(
      table.vendaId,
      table.conta,
    ),
  ],
)

export type VendaMarketplace = typeof vendasMarketplace.$inferSelect
export type NewVendaMarketplace = typeof vendasMarketplace.$inferInsert

// PEDIDOS FINALIZADOS lançados como venda do dia — o DETALHE, uma linha por
// pedido, com o número dele.
//
// Existe separada de `vendasMarketplace` por dois motivos que se somam:
// aquela tabela é apagada e regravada inteira a cada salvamento manual do dia
// (ver vendas/actions.ts), e a chave dela é (venda, conta), sem lugar pro
// número do pedido.
//
// O DINHEIRO não está aqui: ele entra no total do dia pela linha ESPELHO em
// `vendasMarketplace`, na conta 'atacado_pedidos', que é a soma destas
// linhas. As duas são o MESMO dinheiro visto de dois jeitos — somar as duas
// contaria a venda duas vezes. A regra inteira vive em
// src/lib/vendas/lancamento-pedido.ts.
//
// `numero` e `cliente` são SNAPSHOT: a venda de setembro não pode mudar de
// nome porque alguém corrigiu o cadastro do cliente em outubro.
export const vendasPedidos = pgTable(
  'vendas_pedidos',
  {
    id: uuid().primaryKey().defaultRandom(),
    vendaId: uuid()
      .notNull()
      .references(() => vendas.id, { onDelete: 'cascade' }),
    orcamentoId: uuid()
      .notNull()
      .references(() => orcamentos.id, { onDelete: 'cascade' }),
    numero: integer().notNull(),
    cliente: text().notNull(),
    // ⚠️ UNIDADES, NÃO VENDAS — e o nome é o que impede a troca.
    //
    // `vendasMarketplace.quantidade` conta VENDAS (a coluna da tela se chama
    // "Vendas": uma conta do ML com 196 no dia teve 196 PEDIDOS). Aqui são as
    // PEÇAS do pedido. Um pedido é UMA venda, de quantas peças for — a linha
    // espelho conta LINHAS desta tabela, nunca soma esta coluna
    // (src/lib/vendas/lancamento-pedido.ts). As duas colunas já se chamaram
    // `quantidade` e a soma errada passou no type-check.
    unidades: integer().notNull().default(0),
    // NOT NULL com default '0', ao contrário do faturamento das outras duas:
    // aqui o valor é sempre calculado dos itens, nunca "não informado".
    faturamento: numeric({ precision: 12, scale: 2 }).notNull().default('0'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    index('vendas_pedidos_venda_idx').on(table.vendaId),
    // Um pedido nunca lança duas vezes — é o que torna re-finalizar
    // idempotente.
    uniqueIndex('vendas_pedidos_orcamento_uidx').on(table.orcamentoId),
  ],
)

export type VendaPedido = typeof vendasPedidos.$inferSelect
export type NewVendaPedido = typeof vendasPedidos.$inferInsert
