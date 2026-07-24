import { relations } from 'drizzle-orm'

import { cores } from './cores'
import { movimentacoesEstoque } from './estoque'
import { coresFornecedorFio, lotesFio } from './fios'
import { maquinas } from './maquinas'
import { apontamentosProducao, eventosKanban, ordensProducao } from './ordens'
import { produtos, variacoesProduto } from './produtos'
import { users } from './users'

export const usersRelations = relations(users, ({ many }) => ({
  ordensCriadas: many(ordensProducao, { relationName: 'criador' }),
  ordensResponsavel: many(ordensProducao, { relationName: 'responsavel' }),
  apontamentos: many(apontamentosProducao),
  eventosKanban: many(eventosKanban),
  movimentacoes: many(movimentacoesEstoque),
}))

export const maquinasRelations = relations(maquinas, ({ many }) => ({
  ordens: many(ordensProducao),
  apontamentos: many(apontamentosProducao),
}))

export const produtosRelations = relations(produtos, ({ many }) => ({
  variacoes: many(variacoesProduto),
  ordens: many(ordensProducao),
  movimentacoes: many(movimentacoesEstoque),
}))

export const variacoesProdutoRelations = relations(variacoesProduto, ({ one, many }) => ({
  produto: one(produtos, {
    fields: [variacoesProduto.produtoId],
    references: [produtos.id],
  }),
  ordens: many(ordensProducao),
  movimentacoes: many(movimentacoesEstoque),
}))

export const ordensProducaoRelations = relations(ordensProducao, ({ one, many }) => ({
  produto: one(produtos, {
    fields: [ordensProducao.produtoId],
    references: [produtos.id],
  }),
  variacao: one(variacoesProduto, {
    fields: [ordensProducao.variacaoId],
    references: [variacoesProduto.id],
  }),
  maquina: one(maquinas, {
    fields: [ordensProducao.maquinaId],
    references: [maquinas.id],
  }),
  criador: one(users, {
    fields: [ordensProducao.criadoPor],
    references: [users.id],
    relationName: 'criador',
  }),
  responsavel: one(users, {
    fields: [ordensProducao.responsavelId],
    references: [users.id],
    relationName: 'responsavel',
  }),
  apontamentos: many(apontamentosProducao),
  eventosKanban: many(eventosKanban),
}))

export const apontamentosProducaoRelations = relations(apontamentosProducao, ({ one }) => ({
  ordem: one(ordensProducao, {
    fields: [apontamentosProducao.ordemId],
    references: [ordensProducao.id],
  }),
  maquina: one(maquinas, {
    fields: [apontamentosProducao.maquinaId],
    references: [maquinas.id],
  }),
  operador: one(users, {
    fields: [apontamentosProducao.operadorId],
    references: [users.id],
  }),
}))

export const eventosKanbanRelations = relations(eventosKanban, ({ one }) => ({
  ordem: one(ordensProducao, {
    fields: [eventosKanban.ordemId],
    references: [ordensProducao.id],
  }),
  usuario: one(users, {
    fields: [eventosKanban.usuarioId],
    references: [users.id],
  }),
}))

export const coresFornecedorFioRelations = relations(
  coresFornecedorFio,
  ({ one, many }) => ({
    cor: one(cores, {
      fields: [coresFornecedorFio.corId],
      references: [cores.id],
    }),
    lotes: many(lotesFio),
  }),
)

export const lotesFioRelations = relations(lotesFio, ({ one }) => ({
  corFornecedor: one(coresFornecedorFio, {
    fields: [lotesFio.corFornecedorId],
    references: [coresFornecedorFio.id],
  }),
}))

export const movimentacoesEstoqueRelations = relations(movimentacoesEstoque, ({ one }) => ({
  produto: one(produtos, {
    fields: [movimentacoesEstoque.produtoId],
    references: [produtos.id],
  }),
  variacao: one(variacoesProduto, {
    fields: [movimentacoesEstoque.variacaoId],
    references: [variacoesProduto.id],
  }),
  usuario: one(users, {
    fields: [movimentacoesEstoque.usuarioId],
    references: [users.id],
  }),
}))
