import { sql } from 'drizzle-orm'
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './users'

// Overrides de acesso por (cargo, área), editados pelo admin em /permissoes.
// `nivel` é 'nenhum' | 'ver' | 'total'. Só guarda os cargos/áreas editáveis;
// o resto é decidido pelos padrões em src/lib/auth/permissoes.ts.
export const permissoesAcesso = pgTable(
  'permissoes_acesso',
  {
    role: text().notNull(),
    area: text().notNull(),
    nivel: text().notNull(),
    atualizadoPor: uuid().references(() => users.id),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [primaryKey({ columns: [table.role, table.area] })],
)

export type PermissaoAcesso = typeof permissoesAcesso.$inferSelect
export type NewPermissaoAcesso = typeof permissoesAcesso.$inferInsert
