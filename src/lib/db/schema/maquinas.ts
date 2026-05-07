import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { maquinaStatusEnum, maquinaTipoEnum } from './enums'

// Teares circulares. operador_atual_id referencia public.users —
// a FK é adicionada via SQL na Fase 2 pra evitar import circular.
export const maquinas = pgTable(
  'maquinas',
  {
    id: uuid().primaryKey().defaultRandom(),
    codigo: text().notNull().unique(),
    nome: text().notNull(),
    tipo: maquinaTipoEnum().notNull(),

    diametroPolegadas: numeric({ precision: 5, scale: 2 }),
    finura: integer(),
    numAlimentadores: integer(),
    capacidadeKgPorHora: numeric({ precision: 8, scale: 3 }),

    status: maquinaStatusEnum().notNull().default('parada'),
    operadorAtualId: uuid(),

    ultimaManutencao: timestamp({ withTimezone: true }),
    proximaManutencao: timestamp({ withTimezone: true }),

    observacoes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('maquinas_status_idx').on(table.status),
    index('maquinas_tipo_idx').on(table.tipo),
  ],
)

export type Maquina = typeof maquinas.$inferSelect
export type NewMaquina = typeof maquinas.$inferInsert
