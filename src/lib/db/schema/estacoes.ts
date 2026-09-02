import { sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Estação = grupo de máquinas cuidado por ATÉ TRÊS operadores, sem turno
// (ver `estacaoOperadores` no fim do arquivo). Tem uma cor própria usada pra
// colorir os cards do kanban. As FKs pra users são adicionadas via SQL
// (evita import circular).
export const estacoes = pgTable(
  'estacoes',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    cor: text(), // hex #rrggbb
    // ⚠️ LEGADO — não leia nem escreva. O conceito de dia/noite acabou;
    // quem manda é `estacaoOperadores`. As colunas ficaram no banco só como
    // registro de quem formava as turmas antigas (as 3 estações que existem
    // estão soft-deleted). Mesmo caso de `produtos.peso_gramas`.
    operadorDiaId: uuid(),
    operadorNoiteId: uuid(),
    ativo: boolean().notNull().default(true),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex('estacoes_nome_ativo_uidx')
      .on(table.nome)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type Estacao = typeof estacoes.$inferSelect
export type NewEstacao = typeof estacoes.$inferInsert

// Operadores da estação. Até 3, e o limite vive no Zod/action — é regra de
// negócio, não verdade do banco (virar 4 é trocar um número).
//
// O UNIQUE em operador_id é que diz "um operador pertence a UMA estação". É
// ele que garante no máximo uma linha ao juntar OP -> responsável -> estação
// no kanban; sem ele o card duplicaria. Criado via SQL (migration 50), igual
// às FKs pra users.
export const estacaoOperadores = pgTable(
  'estacao_operadores',
  {
    estacaoId: uuid().notNull(),
    operadorId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.estacaoId, table.operadorId] })],
)

export type EstacaoOperador = typeof estacaoOperadores.$inferSelect
