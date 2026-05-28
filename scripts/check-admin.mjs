import 'dotenv/config'
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false })

try {
  const rows = await sql`
    SELECT id, username, email, nome, role, ativo, deleted_at
    FROM public.users
    ORDER BY role
  `
  console.log('Usuários em public.users:')
  for (const r of rows) {
    console.log(
      `  ${r.role.padEnd(18)} u=${r.username.padEnd(12)} email=${r.email.padEnd(30)} ativo=${r.ativo} deletedAt=${r.deleted_at}`,
    )
  }
} catch (err) {
  console.error('ERRO:', err.message)
} finally {
  await sql.end()
}
