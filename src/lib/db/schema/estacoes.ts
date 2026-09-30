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

// Estação = o grupo de máquinas perto de um tablet — o LUGAR do tablet na
// fábrica. Não tem operador: ele não pertence a estação nenhuma e age em
// qualquer máquina (src/lib/db/acao-do-operador.ts); a estação do tablet fica
// gravada no próprio aparelho (src/lib/auth/estacao-do-aparelho.ts). Tem uma
// cor própria usada pra colorir os cards do kanban. As FKs pra users são adicionadas via SQL
// (evita import circular).
export const estacoes = pgTable(
  'estacoes',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    cor: text(), // hex #rrggbb
    // ⚠️ LEGADO — não leia nem escreva. O conceito de dia/noite acabou. As
    // colunas ficaram no banco só como
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

// ⚠️ LEGADO — NINGUÉM LÊ NEM GRAVA MAIS AQUI. Era "quem é de qual estação"
// (até 3 por estação, UNIQUE em operador_id, migration 50). Saiu de uso
// quando a estação passou a ser do TABLET e não do operador: prender operador
// a estação não funcionava no almoço nem no revezamento da madrugada. A
// tabela ficou com os vínculos antigos, sem DROP e sem DELETE — a limpeza,
// se um dia acontecer, é combinada à parte. As policies RLS das migrations 56
// e 57 ainda a citam; o app grava pela conexão direta e não passa por elas.
// Declarada aqui só pra o schema continuar descrevendo o banco.
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
