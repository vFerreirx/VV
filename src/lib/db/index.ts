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

const client =
  globalForPg.pgClient ??
  postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    prepare: false,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgClient = client
}

export const db = drizzle(client, { schema, casing: 'snake_case' })

export type Database = typeof db
export { schema }
