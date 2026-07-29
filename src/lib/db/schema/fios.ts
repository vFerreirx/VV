import { sql } from 'drizzle-orm'
import {
  boolean,
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

import { cores } from './cores'
import { users } from './users'

// De-para: a cor que o FORNECEDOR usa (nome/código dele) vinculada à cor
// equivalente do nosso catálogo (`cores`). A entrada de lote referencia
// esta tabela, não `cores` diretamente — assim a mesma cor nossa pode ter
// vários nomes de fornecedor diferentes apontando pra ela.
export const coresFornecedorFio = pgTable(
  'cores_fornecedor_fio',
  {
    id: uuid().primaryKey().defaultRandom(),
    nomeFornecedor: text().notNull(),
    corId: uuid()
      .notNull()
      .references(() => cores.id),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('cores_fornecedor_fio_cor_idx').on(table.corId),
    uniqueIndex('cores_fornecedor_fio_nome_uidx')
      .on(table.nomeFornecedor)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type CorFornecedorFio = typeof coresFornecedorFio.$inferSelect
export type NewCorFornecedorFio = typeof coresFornecedorFio.$inferInsert

// Entrada de lote de fio. Saldo = caixas/pesoTotalKg menos a soma das
// saídas em `movimentacoesFio`.
export const lotesFio = pgTable(
  'lotes_fio',
  {
    id: uuid().primaryKey().defaultRandom(),
    numeroLote: text().notNull(),
    corFornecedorId: uuid()
      .notNull()
      .references(() => coresFornecedorFio.id),

    caixas: integer().notNull(),
    // Peso total real do lote (padrão caixas×32kg calculado na tela, mas
    // ajustável manualmente quando o lote vem mais leve).
    pesoTotalKg: numeric({ precision: 10, scale: 2 }).notNull(),
    // Valor total do lote em R$. R$/kg é derivado (valorTotal ÷ pesoTotalKg)
    // só pra exibição — não armazenado.
    valorTotal: numeric({ precision: 12, scale: 2 }).notNull(),

    vendedor: text().notNull(),
    // Sem default no banco (mesmo padrão de `vendas.data`/`eventos.data`) —
    // o formulário já manda a data de hoje por padrão.
    dataEntrada: date().notNull(),
    vencimentoPagamento: date().notNull(),

    notaFiscal: text(),
    observacao: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('lotes_fio_cor_fornecedor_idx').on(table.corFornecedorId),
    index('lotes_fio_data_entrada_idx').on(table.dataEntrada),
  ],
)

export type LoteFio = typeof lotesFio.$inferSelect
export type NewLoteFio = typeof lotesFio.$inferInsert

// Saída (retirada) de fio de um lote. Lançamento imobilizado — sem
// editar/apagar depois; erro se corrige com um lançamento novo. Mesmo
// espírito de `movimentacoesEstoque`.
export const movimentacoesFio = pgTable(
  'movimentacoes_fio',
  {
    id: uuid().primaryKey().defaultRandom(),
    loteId: uuid()
      .notNull()
      .references(() => lotesFio.id),

    caixas: integer().notNull(),
    // Peso retirado real (pode não ser proporcional às caixas — mesma
    // lógica de ajuste manual da entrada).
    pesoKg: numeric({ precision: 10, scale: 2 }).notNull(),

    data: date().notNull(),
    motivo: text().notNull(),
    observacao: text(),

    usuarioId: uuid().references(() => users.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('movimentacoes_fio_lote_idx').on(table.loteId),
    index('movimentacoes_fio_data_idx').on(table.data),
  ],
)

export type MovimentacaoFio = typeof movimentacoesFio.$inferSelect
export type NewMovimentacaoFio = typeof movimentacoesFio.$inferInsert
