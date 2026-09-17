import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido no ambiente')
}

// Cache do pool em globalThis pra sobreviver ao HMR do Next em dev.
const globalForPg = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>
}

// Num objeto à parte, e não literal na chamada: `max_pipeline` existe no
// runtime do postgres.js (src/index.js, junto de `idle_timeout`), mas não nos
// tipos dele — literal na chamada, o TypeScript recusa a propriedade.
const opcoes = {
  max: 10,
  idle_timeout: 20,
  prepare: false,
  // ⚠️ SEM PIPELINING. Com as 10 conexões ocupadas, o postgres.js empilha
  // até 100 consultas na MESMA conexão sem esperar a anterior terminar. Pelo
  // pooler do Supabase em modo transação (porta 6543) isso trava: a consulta
  // fica pela metade, o banco espera o resto pra sempre (`ClientRead` em
  // pg_stat_activity), a página nunca termina e a conexão fica presa — e as
  // próximas páginas da mesma instância travam atrás dela. Apareceu em
  // 17/09/2026, quando a página do pedido passou a fazer ~18 consultas em
  // paralelo: o dashboard e o pedido ficaram no esqueleto de carregamento.
  //
  // Com 0, cada conexão leva UMA consulta por vez e o excesso espera na fila
  // do próprio postgres.js, que é o caminho seguro com pooler.
  max_pipeline: 0,
}

const client =
  globalForPg.pgClient ?? postgres(process.env.DATABASE_URL, opcoes)

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgClient = client
}

export const db = drizzle(client, { schema, casing: 'snake_case' })

export type Database = typeof db
export { schema }
