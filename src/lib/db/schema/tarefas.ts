import { sql } from 'drizzle-orm'
import {
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { contasMarketplace } from './contas-marketplace'
import { tarefaPrioridadeEnum } from './enums'
import { users } from './users'

// Lista de tarefas da ADMINISTRAÇÃO — pendências de gestão comercial dos
// marketplaces ("criar promoção do mês", "cadastrar anúncio novo").
//
// Nada a ver com produção: o kanban de OPs cuida daquilo.
//
// A lista é COMPARTILHADA entre os admins, sem atribuição a pessoa: quem
// fizer marca como concluída. Como são vários admins, a tarefa guarda quem
// concluiu e quando.
export const tarefas = pgTable(
  'tarefas',
  {
    id: uuid().primaryKey().defaultRandom(),
    titulo: text().notNull(),
    descricao: text(),
    // Opcional: boa parte das pendências não tem data.
    prazo: date(),
    // Mesmos níveis da OP, enum próprio (ver enums.ts). Default 'normal':
    // tarefa que ninguém marcou de nada é normal, e é o que as antigas são.
    prioridade: tarefaPrioridadeEnum().notNull().default('normal'),
    // "Promoção em qual das 6 contas?" — mas existem tarefas gerais, então
    // é opcional. SET NULL: apagar uma conta nunca apaga tarefa.
    contaId: uuid().references(() => contasMarketplace.id, {
      onDelete: 'set null',
    }),

    // ESTADO DA TAREFA. Nulo = pendente. Não existe coluna booleana
    // separada de propósito: dois campos pra mesma verdade saem de
    // sincronia. O banco ainda garante, por CHECK, que data e autor da
    // conclusão andam sempre juntos.
    concluidaEm: timestamp({ withTimezone: true }),
    concluidaPor: uuid().references(() => users.id),
    criadoPor: uuid().references(() => users.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // A consulta da tela e a do painel são a mesma (pendentes por prazo);
    // o índice parcial cobre as duas e ignora o histórico de concluídas.
    index('tarefas_pendentes_idx')
      .on(table.prazo)
      .where(sql`${table.concluidaEm} IS NULL AND ${table.deletedAt} IS NULL`),
    // O MENU pergunta "existe tarefa aberta alta/urgente?" em TODA
    // navegação. Índice parcial só das abertas, ordenado por prioridade: a
    // consulta lê UMA entrada, não importa o tamanho do histórico. A lista
    // da tela, que ordena por prioridade primeiro, usa o mesmo.
    index('tarefas_abertas_prioridade_idx')
      .on(table.prioridade.desc())
      .where(sql`${table.concluidaEm} IS NULL AND ${table.deletedAt} IS NULL`),
    index('tarefas_conta_idx').on(table.contaId),
  ],
)

export type Tarefa = typeof tarefas.$inferSelect
export type NewTarefa = typeof tarefas.$inferInsert

// -----------------------------------------------------------------
// Tarefas DIÁRIAS
// -----------------------------------------------------------------
//
// Rotinas que voltam a aparecer pendentes todo dia. Tabela SEPARADA, e não
// uma coluna `diaria` em `tarefas`: as duas quase não compartilham campo —
// a diária não tem prazo, não tem prioridade, não tem conta — e sobretudo
// não compartilham SIGNIFICADO. Uma tarefa pendente é dívida; uma diária
// pendente é só "ainda não deu a hora".
//
// NÃO ACUMULA e NÃO ACENDE A BOLINHA DO MENU. `alertaDeTarefas`
// (src/lib/db/tarefas.ts) não olha esta tabela, e não deve passar a olhar:
// um aviso que acende sozinho toda manhã deixa de ser aviso em uma semana.
// Pelo mesmo motivo ela não entra no painel do dashboard.
//
// "FEITA HOJE" NÃO É COLUNA — é `concluidaEm` caindo no dia de hoje EM
// BRASÍLIA (src/lib/dia-brasil.ts). Virou o dia, a diária volta pendente
// sozinha, sem cron e sem linha por dia. Ver supabase/sql/49_tarefas_diarias.sql.
export const tarefasDiarias = pgTable('tarefas_diarias', {
  id: uuid().primaryKey().defaultRandom(),
  titulo: text().notNull(),
  descricao: text(),

  // 0=domingo, igual ao getDay() do JS e ao EXTRACT(DOW) do Postgres.
  // Padrão: todos os sete. O CHECK do banco garante não-vazio e 0..6.
  diasSemana: smallint()
    .array()
    .notNull()
    .default(sql`'{0,1,2,3,4,5,6}'`),

  // Instante da última conclusão. Só vale como "feita hoje" se cair no dia
  // de hoje; uma conclusão de ontem simplesmente deixa de contar.
  concluidaEm: timestamp({ withTimezone: true }),
  // São vários admins: a pergunta do dia é "quem já fez isso hoje?".
  concluidaPor: uuid().references(() => users.id),
  criadoPor: uuid().references(() => users.id),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  deletedAt: timestamp({ withTimezone: true }),
})
// Sem índice de propósito: a tabela não cresce com o uso — é o conjunto fixo
// de rotinas da casa, justamente porque "feita hoje" não gera linha. O
// porquê longo está na migration 49.

export type TarefaDiaria = typeof tarefasDiarias.$inferSelect
export type NewTarefaDiaria = typeof tarefasDiarias.$inferInsert
