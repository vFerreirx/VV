import { sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Estação = grupo de máquinas cuidado por uma dupla (operador de dia +
// operador de noite). Tem uma cor própria usada pra colorir os cards do
// kanban. As FKs pra users são adicionadas via SQL (evita import circular).
export const estacoes = pgTable(
  'estacoes',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    cor: text(), // hex #rrggbb
    operadorDiaId: uuid(),
    operadorNoiteId: uuid(),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex('estacoes_nome_ativo_uidx')
      .on(table.nome)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type Estacao = typeof estacoes.$inferSelect
export type NewEstacao = typeof estacoes.$inferInsert
