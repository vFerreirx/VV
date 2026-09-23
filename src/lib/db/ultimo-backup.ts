import { desc } from 'drizzle-orm'

import { db } from '@/lib/db'
import { backupsRegistro, type BackupRegistro } from '@/lib/db/schema'

/**
 * O registro do backup mais recente — uma linha, pelo índice de `feito_em`.
 *
 * ⚠️ SEM GUARDA AQUI DENTRO, de propósito: quem chama checa `role ===
 * 'admin'` ANTES, e pra quem não é a consulta nem acontece (dashboard e
 * sino). É o assunto do banco inteiro — o gerente não entra. O estado sai de
 * `estadoDoBackup` (src/lib/backup.ts), o mesmo pros dois lugares.
 */
export async function obterUltimoBackup(): Promise<BackupRegistro | null> {
  const [ultimo] = await db
    .select()
    .from(backupsRegistro)
    .orderBy(desc(backupsRegistro.feitoEm))
    .limit(1)
  return ultimo ?? null
}
