import { sql } from 'drizzle-orm'
import { date, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { contasMarketplace } from './contas-marketplace'
import { ordemCanalEnum } from './enums'

// Remessa Full: agrupador de OPs por envio (Full ML/Shopee + data).
// As OPs criadas "dentro" do Full recebem remessa_full_id e herdam a
// data de envio como prazo (data_prevista_fim).
export const remessasFull = pgTable(
  'remessas_full',
  {
    id: uuid().primaryKey().defaultRandom(),
    canal: ordemCanalEnum().notNull(),
    dataEnvio: date().notNull(),
    observacao: text(),

    // Identificador do envio no marketplace, lido do PDF na importação:
    // "72785017" (Frete # do ML) ou "INBRFSP12607220343" (ASN ID da
    // Shopee). Único por canal entre as não-excluídas — é o que impede
    // importar o mesmo envio duas vezes. Nulo nas remessas criadas à mão.
    envioId: text(),

    // Conta de marketplace por onde o envio saiu.
    //
    // NULLABLE de propósito, e continua assim: as remessas criadas antes
    // deste cadastro não têm conta e não houve backfill. A obrigatoriedade
    // vive no FORMULÁRIO — o banco precisa aceitar o histórico como ele é.
    // ON DELETE SET NULL: apagar uma conta nunca apaga remessa.
    contaId: uuid().references(() => contasMarketplace.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('remessas_full_data_idx').on(table.dataEnvio),
    index('remessas_full_conta_idx').on(table.contaId),
    uniqueIndex('remessas_full_envio_uidx')
      .on(table.canal, table.envioId)
      .where(sql`${table.envioId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ],
)

export type RemessaFull = typeof remessasFull.$inferSelect
export type NewRemessaFull = typeof remessasFull.$inferInsert
