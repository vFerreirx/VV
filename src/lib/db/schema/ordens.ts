import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { ordemCanalEnum, ordemPrioridadeEnum, ordemStatusEnum } from './enums'
import { maquinas } from './maquinas'
import { produtos, variacoesProduto } from './produtos'
import { remessasFull } from './remessas'
import { users } from './users'

// Ordem de produção (OP).
// O `numero` (formato OP-AAAA-NNNN) é preenchido por trigger Postgres
// criado na Fase 2, usando uma sequence reiniciada por ano.
// A quantidade é em PEÇAS (peseiras, capas de almofada, etc).
export const ordensProducao = pgTable(
  'ordens_producao',
  {
    id: uuid().primaryKey().defaultRandom(),
    numero: text().notNull().unique(),

    produtoId: uuid()
      .notNull()
      .references(() => produtos.id),
    variacaoId: uuid().references(() => variacoesProduto.id),

    quantidade: integer().notNull(),

    maquinaId: uuid().references(() => maquinas.id),

    // Remessa Full a que a OP pertence (opcional).
    remessaFullId: uuid().references(() => remessasFull.id),

    canalDestino: ordemCanalEnum().notNull().default('estoque'),
    prioridade: ordemPrioridadeEnum().notNull().default('normal'),
    status: ordemStatusEnum().notNull().default('aguardando_materia_prima'),

    dataPrevistaInicio: timestamp({ withTimezone: true }),
    dataPrevistaFim: timestamp({ withTimezone: true }),
    dataRealInicio: timestamp({ withTimezone: true }),
    dataRealFim: timestamp({ withTimezone: true }),

    criadoPor: uuid().references(() => users.id),
    responsavelId: uuid().references(() => users.id),

    observacoes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('ordens_producao_status_idx').on(table.status),
    index('ordens_producao_maquina_idx').on(table.maquinaId),
    index('ordens_producao_produto_idx').on(table.produtoId),
    index('ordens_producao_canal_idx').on(table.canalDestino),
    index('ordens_producao_prioridade_idx').on(table.prioridade),
    index('ordens_producao_data_prevista_fim_idx').on(table.dataPrevistaFim),
  ],
)

// Apontamentos de produção — registros operacionais por turno/intervalo.
// Quantidades em peças (mesma unidade da OP).
export const apontamentosProducao = pgTable(
  'apontamentos_producao',
  {
    id: uuid().primaryKey().defaultRandom(),
    ordemId: uuid()
      .notNull()
      .references(() => ordensProducao.id, { onDelete: 'cascade' }),
    // Máquina é opcional: no fluxo puxado o operador aponta sem máquina.
    maquinaId: uuid().references(() => maquinas.id),
    operadorId: uuid()
      .notNull()
      .references(() => users.id),

    inicio: timestamp({ withTimezone: true }).notNull(),
    fim: timestamp({ withTimezone: true }),

    quantidadeProduzida: integer().notNull().default(0),
    quantidadeRefugo: integer().notNull().default(0),

    motivoParada: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    index('apontamentos_ordem_idx').on(table.ordemId),
    index('apontamentos_maquina_idx').on(table.maquinaId),
    index('apontamentos_operador_idx').on(table.operadorId),
  ],
)

// Auditoria de transições do kanban — toda mudança de status_novo da OP
// gera uma linha aqui (server action escreve, RLS controla leitura).
export const eventosKanban = pgTable(
  'eventos_kanban',
  {
    id: uuid().primaryKey().defaultRandom(),
    ordemId: uuid()
      .notNull()
      .references(() => ordensProducao.id, { onDelete: 'cascade' }),
    statusAnterior: ordemStatusEnum(),
    statusNovo: ordemStatusEnum().notNull(),
    usuarioId: uuid().references(() => users.id),
    observacao: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('eventos_kanban_ordem_idx').on(table.ordemId),
    index('eventos_kanban_created_at_idx').on(table.createdAt),
  ],
)

export type OrdemProducao = typeof ordensProducao.$inferSelect
export type NewOrdemProducao = typeof ordensProducao.$inferInsert
export type ApontamentoProducao = typeof apontamentosProducao.$inferSelect
export type NewApontamentoProducao = typeof apontamentosProducao.$inferInsert
export type EventoKanban = typeof eventosKanban.$inferSelect
export type NewEventoKanban = typeof eventosKanban.$inferInsert
