import { sql } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

// Empresas do grupo — são ~3 CNPJs, e cada uma tem uma conta em cada
// marketplace.
//
// A empresa marcada como PRINCIPAL é a que identifica os documentos
// impressos (pedido, via de separação e romaneio). Só pode haver uma, e
// quem garante isso é o índice único parcial lá embaixo — a action
// desmarcar a anterior é conveniência, não a garantia.
//
// `cnpj` é guardado NORMALIZADO (só dígitos/maiúsculas, sem pontuação),
// igual ao documento do comprador; a pontuação entra só na exibição.
// Nullable porque o cadastro pode nascer antes de alguém ter o CNPJ à
// mão — o dígito verificador é validado no zod quando vem preenchido.
export const empresas = pgTable(
  'empresas',
  {
    id: uuid().primaryKey().defaultRandom(),
    razaoSocial: text().notNull(),
    nomeFantasia: text(),
    cnpj: text(),
    principal: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // Um CNPJ não se repete entre as empresas vivas. Parcial: várias
    // linhas podem ter cnpj NULL, e as excluídas saem do índice.
    uniqueIndex('empresas_cnpj_uidx')
      .on(table.cnpj)
      .where(sql`${table.cnpj} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    // No máximo UMA principal: o índice é único sobre a própria coluna e
    // só enxerga as linhas onde ela é true, então duas principais colidem
    // na mesma chave. É isso que segura dois cliques ao mesmo tempo.
    uniqueIndex('empresas_principal_uidx')
      .on(table.principal)
      .where(sql`${table.principal} AND ${table.deletedAt} IS NULL`),
  ],
)

export type Empresa = typeof empresas.$inferSelect
export type NewEmpresa = typeof empresas.$inferInsert
