import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Carrega variáveis de .env.local pra drizzle-kit (CLI)
loadEnv({ path: '.env.local' })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido — copie .env.example pra .env.local')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  schemaFilter: ['public'],
  casing: 'snake_case',
  verbose: true,
  strict: true,
})
