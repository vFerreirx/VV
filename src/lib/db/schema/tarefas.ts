import { sql } from 'drizzle-orm'
import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { contasMarketplace } from './contas-marketplace'
import { users } from './users'

// Lista de tarefas da ADMINISTRAÇÃO — pendências de gestão comercial dos
// marketplaces ("criar promoção do mês", "cadastrar anúncio novo").
//
// Nada a ver com produção: o kanban de OPs cuida daquilo.
//
// A lista é COMPARTILHADA entre os admins, sem atribuição a pessoa: quem
// fizer marca como concluída. Como são vários admins, a tarefa guarda quem
// concluiu e quando.
export const tarefas = pgTable(
  'tarefas',
  {
    id: uuid().primaryKey().defaultRandom(),
    titulo: text().notNull(),
    descricao: text(),
    // Opcional: boa parte das pendências não tem data.
    prazo: date(),
    // "Promoção em qual das 6 contas?" — mas existem tarefas gerais, então
    // é opcional. SET NULL: apagar uma conta nunca apaga tarefa.
    contaId: uuid().references(() => contasMarketplace.id, {
      onDelete: 'set null',
    }),

    // ESTADO DA TAREFA. Nulo = pendente. Não existe coluna booleana
    // separada de propósito: dois campos pra mesma verdade saem de
    // sincronia. O banco ainda garante, por CHECK, que data e autor da
    // conclusão andam sempre juntos.
    concluidaEm: timestamp({ withTimezone: true }),
    concluidaPor: uuid().references(() => users.id),
    criadoPor: uuid().references(() => users.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // A consulta da tela e a do painel são a mesma (pendentes por prazo);
    // o índice parcial cobre as duas e ignora o histórico de concluídas.
    index('tarefas_pendentes_idx')
      .on(table.prazo)
      .where(sql`${table.concluidaEm} IS NULL AND ${table.deletedAt} IS NULL`),
    index('tarefas_conta_idx').on(table.contaId),
  ],
)

export type Tarefa = typeof tarefas.$inferSelect
export type NewTarefa = typeof tarefas.$inferInsert
