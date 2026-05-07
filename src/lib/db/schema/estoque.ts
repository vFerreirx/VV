import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { movimentacaoTipoEnum } from './enums'
import { produtos, variacoesProduto } from './produtos'
import { users } from './users'

// Movimentações de estoque — fonte da verdade do saldo, agregado em queries.
// `referencia_id` + `referencia_tipo` é polimórfico (ex: ordem_id, ajuste_id).
export const movimentacoesEstoque = pgTable(
  'movimentacoes_estoque',
  {
    id: uuid().primaryKey().defaultRandom(),
    produtoId: uuid()
      .notNull()
      .references(() => produtos.id),
    variacaoId: uuid().references(() => variacoesProduto.id),

    tipo: movimentacaoTipoEnum().notNull(),
    quantidadeKg: numeric({ precision: 12, scale: 3 }).notNull().default('0'),
    quantidadeUnidades: numeric({ precision: 12, scale: 3 }).notNull().default('0'),

    referenciaId: uuid(),
    referenciaTipo: text(),

    usuarioId: uuid().references(() => users.id),
    observacao: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('movimentacoes_produto_idx').on(table.produtoId),
    index('movimentacoes_tipo_idx').on(table.tipo),
    index('movimentacoes_created_at_idx').on(table.createdAt),
  ],
)

export type MovimentacaoEstoque = typeof movimentacoesEstoque.$inferSelect
export type NewMovimentacaoEstoque = typeof movimentacoesEstoque.$inferInsert
