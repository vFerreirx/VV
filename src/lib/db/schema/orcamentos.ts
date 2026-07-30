import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { orcamentoStatusEnum } from './enums'
import { kits } from './kits'

// Snapshot dos componentes do kit no momento do orçamento — o orçamento é
// documento histórico, não pode mudar se a composição do kit mudar depois.
// `quantidade` é POR KIT (igual a kit_itens.quantidade), não já multiplicada
// pela quantidade do item do orçamento — a multiplicação acontece na via de
// separação.
// `tamanho` é o tamanho REAL do componente (a capa é 45x45 mesmo num kit
// "Queen"), resolvido a partir do tamanho único escolhido pro kit. Opcional
// porque orçamentos antigos não têm.
export type KitComponenteSnapshot = {
  produtoNome: string
  cor: string | null
  quantidade: number
  tamanho?: string | null
}

// Orçamento pra cliente (ex.: atacado): cabeçalho + itens com preço
// manual (produtos não têm preço no catálogo). Número sequencial simples.
export const orcamentos = pgTable(
  'orcamentos',
  {
    id: uuid().primaryKey().defaultRandom(),
    numero: integer().generatedAlwaysAsIdentity(),
    cliente: text().notNull(),
    observacao: text(),
    status: orcamentoStatusEnum().notNull().default('aguardando'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [index('orcamentos_numero_idx').on(table.numero)],
)

export const orcamentoItens = pgTable(
  'orcamento_itens',
  {
    id: uuid().primaryKey().defaultRandom(),
    orcamentoId: uuid()
      .notNull()
      .references(() => orcamentos.id, { onDelete: 'cascade' }),
    descricao: text().notNull(),
    quantidade: integer().notNull().default(1),
    precoUnitario: numeric({ precision: 12, scale: 2 }).notNull().default('0'),
    // Kit estruturado (nulo pra produto avulso e pra orçamentos antigos).
    kitId: uuid().references(() => kits.id, { onDelete: 'set null' }),
    tamanho: text(),
    kitComponentes: jsonb().$type<KitComponenteSnapshot[]>(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [index('orcamento_itens_orcamento_idx').on(table.orcamentoId)],
)

export type Orcamento = typeof orcamentos.$inferSelect
export type NewOrcamento = typeof orcamentos.$inferInsert
export type OrcamentoItem = typeof orcamentoItens.$inferSelect
export type NewOrcamentoItem = typeof orcamentoItens.$inferInsert
