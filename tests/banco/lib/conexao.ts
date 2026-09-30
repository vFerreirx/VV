// A conexão DO TESTE, e só dele.
//
// ⚠️ A DATABASE_URL SAI DO process.env ANTES DE QUALQUER ACTION CARREGAR. Ela
// é lida do .env.local direto pra cá (`processEnv: {}` não popula o env) e,
// se veio do shell, é apagada. Assim, se algum mock falhar e o `@/lib/db` de
// verdade carregar, ele morre no `throw` de "DATABASE_URL não definido" em
// vez de abrir um pool próprio — e não existe caminho pra um commit
// acidental: toda gravação passa pela transação de `rodarDesfeito`.
//
// ⚠️ O DRIZZLE É CONFIGURADO IGUAL AO DE src/lib/db/index.ts: schema +
// `casing: 'snake_case'`. Sem o casing, o SQL sai com os nomes em camelCase
// ("ordemId") e toda consulta das actions falha. Mudou lá, muda aqui.

import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '@/lib/db/schema'

function lerDatabaseUrl(): string {
  const lido: Record<string, string> = {}
  config({ path: '.env.local', processEnv: lido, quiet: true })
  const url = lido.DATABASE_URL ?? process.env.DATABASE_URL
  delete process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL não encontrada em .env.local')
  }
  return url
}

function criarBanco(url: string) {
  // UMA conexão: a transação de fora mora nela, e as consultas de fora da
  // transação (o retrato de antes e de depois) só rodam quando ela acabou.
  const client = postgres(url, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    onnotice: () => {},
  })
  return {
    client,
    db: drizzle(client, { schema, casing: 'snake_case' }),
  }
}

export type Banco = ReturnType<typeof criarBanco>['db']
/** A transação de fora, que as actions recebem no lugar do `db`. */
export type Tx = Parameters<Parameters<Banco['transaction']>[0]>[0]

export function abrirConexao(): { db: Banco; fechar: () => Promise<void> } {
  const { client, db } = criarBanco(lerDatabaseUrl())
  return { db, fechar: () => client.end({ timeout: 5 }) }
}
