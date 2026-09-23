import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { ordensProducao } from './ordens'
import { produtos, variacoesProduto } from './produtos'
import { users } from './users'

// ─────────────────────────────────────────────────────────────────────────
// FILA DE REPOSIÇÃO DE ESTOQUE
// ─────────────────────────────────────────────────────────────────────────
//
// ⚠️ ESTA DECLARAÇÃO NÃO CRIA A TABELA. Quem cria é o
// supabase/sql/59_reposicoes_estoque.sql, com os CHECKs, as policies e os
// índices únicos PARCIAIS ("no máximo um item ativo por variação", "uma OP
// atende um item"). Aqui é só a forma, pra que as queries sejam tipadas —
// mesmo arranjo de `maquinaParadas` (57). Ao mexer numa, mexa na outra.
//
// Os valores de `situacao` e `estado` moram em src/lib/producao/reposicao.ts,
// espelhando os CHECKs.
export const reposicoesEstoque = pgTable('reposicoes_estoque', {
  id: uuid().primaryKey().defaultRandom(),
  produtoId: uuid()
    .notNull()
    .references(() => produtos.id),
  variacaoId: uuid()
    .notNull()
    .references(() => variacoesProduto.id),

  situacao: text().notNull(),
  observacao: text(),
  marcadoPor: uuid().references(() => users.id),
  marcadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),

  estado: text().notNull().default('aberto'),
  ordemId: uuid().references(() => ordensProducao.id),
  repostoEm: timestamp({ withTimezone: true }),

  // Produto de parceiro: "Pedir ao parceiro" grava quem e quando (72).
  pedidoParceiroEm: timestamp({ withTimezone: true }),
  pedidoParceiroPor: uuid().references(() => users.id),

  descartadoEm: timestamp({ withTimezone: true }),
  descartadoPor: uuid().references(() => users.id),
  motivoDescarte: text(),
})

export type ReposicaoEstoque = typeof reposicoesEstoque.$inferSelect
