/**
 * Orquestrador de setup do banco — aplicado contra o Postgres do Supabase local.
 *
 * Fluxo:
 *   1. drizzle-kit migrate (cria tabelas + enums + FKs internas)
 *   2. aplica todos os .sql de supabase/sql/ em ordem alfabética
 *      (constraints externos, triggers, RLS)
 *
 * Uso: npm run db:setup
 *
 * Pré-requisitos: `supabase start` rodando + DATABASE_URL em .env.local.
 */

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { config as loadEnv } from 'dotenv'
import postgres from 'postgres'

loadEnv({ path: '.env.local' })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não definido em .env.local')
  process.exit(1)
}

const SQL_DIR = join(process.cwd(), 'supabase', 'sql')

async function main() {
  console.log('▶ Aplicando migrations Drizzle…')
  try {
    execSync('npx drizzle-kit migrate', { stdio: 'inherit' })
  } catch (err) {
    console.error('❌ drizzle-kit migrate falhou')
    throw err
  }

  console.log('\n▶ Aplicando SQLs de supabase/sql/ …')
  const sqlFiles = readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (sqlFiles.length === 0) {
    console.log('  (nenhum arquivo encontrado)')
    return
  }

  const sql = postgres(DATABASE_URL!, { max: 1, prepare: false })

  try {
    for (const file of sqlFiles) {
      process.stdout.write(`  • ${file} … `)
      const content = readFileSync(join(SQL_DIR, file), 'utf-8')
      await sql.unsafe(content)
      console.log('ok')
    }
  } finally {
    await sql.end()
  }

  console.log('\n✅ Setup do banco concluído.')
}

main().catch((err) => {
  console.error('\n❌ Setup falhou:', err.message ?? err)
  process.exit(1)
})
