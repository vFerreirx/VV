import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { empresas } from './empresas'
import { ordemCanalEnum } from './enums'

// Contas de marketplace: são 3 no Mercado Livre e 3 na Shopee, e cada
// envio Full sai por uma delas.
//
// A conta é ESCOLHIDA na mão, nunca detectada: o PDF do ML traz só o
// número do envio e a Picking List da Shopee só o cabeçalho das colunas —
// nenhum dos dois diz de qual conta veio.
//
// `ativo` para de oferecer a conta nos formulários sem apagar o histórico
// das remessas que já apontam pra ela.
export const contasMarketplace = pgTable(
  'contas_marketplace',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Reaproveita o enum de canal; só full_ml/full_shopee entram (validado
    // no zod, mesmo padrão de remessasFull).
    canal: ordemCanalEnum().notNull(),
    nome: text().notNull(),
    // Empresa (CNPJ) dona da conta.
    // NULLABLE de propósito, e continua assim: as contas cadastradas antes
    // do cadastro de empresas não têm empresa e não houve backfill. A
    // obrigatoriedade vive no FORMULÁRIO — mesmo critério do contaId da
    // remessa. ON DELETE SET NULL: apagar uma empresa nunca apaga conta.
    empresaId: uuid().references(() => empresas.id, { onDelete: 'set null' }),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // "Principal" pode existir no ML e na Shopee ao mesmo tempo; duas
    // "Principal" no ML, não.
    uniqueIndex('contas_marketplace_nome_uidx')
      .on(table.canal, table.nome)
      .where(sql`${table.deletedAt} IS NULL`),
    index('contas_marketplace_canal_idx').on(table.canal),
    index('contas_marketplace_empresa_idx').on(table.empresaId),
  ],
)

export type ContaMarketplace = typeof contasMarketplace.$inferSelect
export type NewContaMarketplace = typeof contasMarketplace.$inferInsert
