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
  // ⚠️ PIPELINING NO MÍNIMO (1), e não o padrão de 100. Com as 10 conexões
  // ocupadas, o postgres.js empilha consultas na MESMA conexão sem esperar a
  // anterior terminar. Pelo pooler do Supabase em modo transação (porta 6543)
  // isso travava: a consulta ficava pela metade, o banco esperava o resto pra
  // sempre (`ClientRead` em pg_stat_activity), a página nunca terminava e a
  // conexão ficava presa — e as próximas páginas da mesma instância travavam
  // atrás dela. Apareceu em 17/09/2026, quando a página do pedido passou a
  // fazer ~18 consultas em paralelo: dashboard e pedido presos no esqueleto.
  //
  // ⚠️ NÃO É 0. Com 0 o postgres.js RECUSA TRANSAÇÃO ("UNSAFE_TRANSACTION:
  // Only use sql.begin, sql.reserved or max: 1") — toda action com
  // `db.transaction` quebrou (editar pedido, criar OP, baixa…). Com 1 cada
  // conexão leva no máximo uma consulta de fila atrás da que está rodando, e
  // a transação funciona.
  max_pipeline: 1,
}

const client =
  globalForPg.pgClient ?? postgres(process.env.DATABASE_URL, opcoes)

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgClient = client
}

export const db = drizzle(client, { schema, casing: 'snake_case' })

export type Database = typeof db
export { schema }
