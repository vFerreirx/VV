import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { userRoleEnum } from './enums'

// public.users — sincronizada com auth.users via trigger criado na Fase 2.
// O id é o mesmo de auth.users (sem default — vem do trigger).
// A FK pra auth.users e a FK circular pra maquinas.id são criadas via SQL
// na Fase 2 (auth schema fica fora do controle do Drizzle).
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey(),
    nome: text().notNull(),
    email: text().notNull().unique(),
    telefone: text(),
    role: userRoleEnum().notNull().default('operador'),
    ativo: boolean().notNull().default(true),
    maquinaAtualId: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('users_role_idx').on(table.role),
    index('users_ativo_idx').on(table.ativo),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
