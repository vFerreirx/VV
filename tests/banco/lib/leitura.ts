// O estado de uma OP lido DIRETO das tabelas, pra conferir o que as actions
// gravaram. As leituras das TELAS (quadro, tablet, ficha) o cenário chama
// pelas próprias actions — é justamente o que tem que carregar sem erro.

import { and, asc, desc, eq, sum } from 'drizzle-orm'

import {
  apontamentosProducao,
  eventosKanban,
  movimentacoesEstoque,
  ordensProducao,
  reposicoesEstoque,
} from '@/lib/db/schema'

import type { Tx } from './conexao'

export function criarLeitura(tx: Tx) {
  return {
    async op(id: string) {
      const [op] = await tx
        .select({
          status: ordensProducao.status,
          maquinaId: ordensProducao.maquinaId,
          responsavelId: ordensProducao.responsavelId,
          canalDestino: ordensProducao.canalDestino,
          remessaFullId: ordensProducao.remessaFullId,
          dataRealFim: ordensProducao.dataRealFim,
        })
        .from(ordensProducao)
        .where(eq(ordensProducao.id, id))
      return op
    },

    apontamentos(id: string) {
      return tx
        .select({
          boas: apontamentosProducao.quantidadeProduzida,
          defeito: apontamentosProducao.quantidadeRefugo,
        })
        .from(apontamentosProducao)
        .where(eq(apontamentosProducao.ordemId, id))
        .orderBy(asc(apontamentosProducao.createdAt))
    },

    /** A entrada no estoque que a OP gerou (0 quando não gerou). */
    async estoque(id: string): Promise<number> {
      const [r] = await tx
        .select({ total: sum(movimentacoesEstoque.quantidade).mapWith(Number) })
        .from(movimentacoesEstoque)
        .where(
          and(
            eq(movimentacoesEstoque.referenciaId, id),
            eq(movimentacoesEstoque.tipo, 'entrada_producao'),
          ),
        )
      return r?.total ?? 0
    },

    /** Os eventos da OP, do mais novo pro mais velho. */
    eventos(id: string) {
      return tx
        .select({
          em: eventosKanban.createdAt,
          de: eventosKanban.statusAnterior,
          para: eventosKanban.statusNovo,
          observacao: eventosKanban.observacao,
          usuarioId: eventosKanban.usuarioId,
        })
        .from(eventosKanban)
        .where(eq(eventosKanban.ordemId, id))
        .orderBy(desc(eventosKanban.createdAt))
    },

    async reposicao(id: string) {
      const [r] = await tx
        .select({
          estado: reposicoesEstoque.estado,
          repostoEm: reposicoesEstoque.repostoEm,
        })
        .from(reposicoesEstoque)
        .where(eq(reposicoesEstoque.id, id))
      return r
    },
  }
}

export type Leitura = ReturnType<typeof criarLeitura>
