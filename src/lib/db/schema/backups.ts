import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// Uma linha por backup bem-sucedido, gravada por scripts/backup-db.ts DEPOIS
// do retrato e da cópia pro Drive. Só o servidor lê (RLS sem política — ver
// supabase/sql/71_backups_registro.sql); o estado sai de src/lib/backup.ts.
export const backupsRegistro = pgTable(
  'backups_registro',
  {
    id: uuid().primaryKey().defaultRandom(),
    feitoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Só o NOME do arquivo, nunca o caminho da máquina.
    arquivo: text().notNull(),
    tamanhoBytes: bigint({ mode: 'number' }).notNull(),
    tabelas: integer().notNull(),
    linhas: integer().notNull(),
    copiaDrive: boolean().notNull(),
    maquina: text().notNull(),
  },
  (table) => [index('backups_registro_feito_em_idx').on(table.feitoEm.desc())],
)

export type BackupRegistro = typeof backupsRegistro.$inferSelect
