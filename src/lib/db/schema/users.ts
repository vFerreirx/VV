import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { userRoleEnum } from './enums'

// public.users — sincronizada com auth.users via trigger criado na Fase 2.
// O id é o mesmo de auth.users (sem default — vem do trigger).
//
// `username` é o identificador de login exibido ao usuário. O Supabase Auth
// internamente trabalha com email, então geramos `{username}@malharia.app`
// como email "interno" — o usuário nunca vê isso, só usa o username.
// `email` permanece pra refletir o que está em auth.users.
export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey(),
    username: text().notNull().unique(),
    nome: text().notNull(),
    email: text().notNull().unique(),
    telefone: text(),
    role: userRoleEnum().notNull().default('operador'),
    // Cor do operador (hex) — usada pra colorir os cards dele no kanban.
    cor: text(),
    ativo: boolean().notNull().default(true),
    maquinaAtualId: uuid(),
    // Troca rápida no tablet da estação — ver supabase/sql/54_pin_operador.sql.
    // NULL = sem PIN, entra só por senha. Guardamos o HASH, nunca o número, e
    // ele NUNCA sai numa consulta que alimente componente de cliente.
    pinHash: text(),
    pinTentativas: integer().notNull().default(0),
    pinBloqueadoAte: timestamp({ withTimezone: true }),
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
