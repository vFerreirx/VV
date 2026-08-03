import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { ordemCanalEnum } from './enums'
import { kits } from './kits'
import { variacoesProduto } from './produtos'
import { users } from './users'

// De-para do Full: dado o CÓDIGO que veio no PDF do envio, o que a fábrica
// produz. Aprende uma vez e reusa nos envios seguintes — é o que faz o
// segundo envio do mesmo item não dar trabalho nenhum.
//
// A chave é o CÓDIGO (Código ML / Shopee SKU ID), não o SKU: o código é
// estável entre envios, enquanto o SKU no PDF do ML vem TRUNCADO em 50
// caracteres ("...CAQUI-AMBAR-DOURA").
export const deParaFull = pgTable(
  'de_para_full',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Reusa ordem_canal_destino; só full_ml/full_shopee entram (validado
    // no zod, mesmo padrão de remessasFull).
    canal: ordemCanalEnum().notNull(),
    codigo: text().notNull(),

    // Kit que originou o mapeamento, só pra referência: pré-seleciona o kit
    // ao reabrir pra editar. NÃO é a fonte da verdade — valem os
    // componentes gravados, mesmo que o kit mude ou seja excluído depois.
    kitId: uuid().references(() => kits.id, { onDelete: 'set null' }),

    // SKU e descrição VISTOS no PDF na hora do mapeamento. Servem só pra
    // detectar que o item mudou desde então — não casam nada.
    skuVisto: text(),
    descricaoVista: text(),

    observacao: text(),
    criadoPor: uuid().references(() => users.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex('de_para_full_codigo_uidx')
      .on(table.canal, table.codigo)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

// Peças de um código. `quantidade` é por UNIDADE do envio (kit com 2 capas
// = 2). Aponta pra VARIAÇÃO (produto + modelo + cor + tamanho) porque é ela
// que a produção precisa: no SIENA a capa é bicolor e "Areia e Cáqui" é uma
// peça diferente de "Areia e Preto".
export const deParaFullComponentes = pgTable(
  'de_para_full_componentes',
  {
    id: uuid().primaryKey().defaultRandom(),
    deParaId: uuid()
      .notNull()
      .references(() => deParaFull.id, { onDelete: 'cascade' }),
    variacaoId: uuid()
      .notNull()
      .references(() => variacoesProduto.id),
    quantidade: integer().notNull().default(1),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('de_para_full_comp_pai_idx').on(table.deParaId),
    index('de_para_full_comp_variacao_idx').on(table.variacaoId),
  ],
)

export type DeParaFull = typeof deParaFull.$inferSelect
export type NewDeParaFull = typeof deParaFull.$inferInsert
export type DeParaFullComponente = typeof deParaFullComponentes.$inferSelect
export type NewDeParaFullComponente = typeof deParaFullComponentes.$inferInsert
