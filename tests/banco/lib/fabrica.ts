// As linhas que o cenário precisa e que nenhuma action dele cria: a OP, a
// remessa, o item de reposição. Toda linha leva a MARCA (retrato.ts), e toda
// OP criada entra na lista do relógio (relogio.ts).
//
// ⚠️ A OP ENTRA COM `numero: ''`, igual ao app (criarOrdemAction e as
// outras): o gatilho `ordens_producao_set_numero` (02) sobrescreve com o
// próximo do `op_numero_counter`. O teste nunca inventa número.

import { hojeEmBrasilia, somarDias } from '@/lib/dia-brasil'
import {
  eventosKanban,
  ordensProducao,
  remessasFull,
  reposicoesEstoque,
} from '@/lib/db/schema'

import type { Tx } from './conexao'
import { MARCA } from './retrato'

type Variacao = { produtoId: string; variacaoId: string }
export type OpCriada = { id: string; numero: string }

export function criarFabrica(tx: Tx, marcarOp: (id: string) => void) {
  async function inserirOp(
    valores: Omit<typeof ordensProducao.$inferInsert, 'numero' | 'observacoes'>,
  ): Promise<OpCriada> {
    const [op] = await tx
      .insert(ordensProducao)
      .values({ ...valores, numero: '', observacoes: MARCA })
      .returning({ id: ordensProducao.id, numero: ordensProducao.numero })
    marcarOp(op.id)
    return op
  }

  return {
    /** OP de estoque na fila (Programado), sem máquina e sem dono. */
    opDeEstoque(v: Variacao, quantidade: number, criadoPor: string) {
      return inserirOp({
        produtoId: v.produtoId,
        variacaoId: v.variacaoId,
        quantidade,
        canalDestino: 'estoque',
        status: 'programado',
        criadoPor,
      })
    },

    /** Remessa Full ML com envio daqui a `dias` dias (de Brasília). */
    async remessaFullMl(contaId: string, dias: number): Promise<string> {
      const [r] = await tx
        .insert(remessasFull)
        .values({
          canal: 'full_ml',
          dataEnvio: somarDias(hojeEmBrasilia(), dias),
          contaId,
          observacao: MARCA,
        })
        .returning({ id: remessasFull.id })
      return r.id
    },

    /**
     * OP da remessa JÁ EM PRODUÇÃO na máquina, com o dono e o evento de
     * início — o estado em que o operador a deixa ao tocar "Iniciar".
     */
    async opDaRemessaEmProducao(
      v: Variacao,
      remessaId: string,
      quantidade: number,
      maquinaId: string,
      operadorId: string,
      criadoPor: string,
    ): Promise<OpCriada> {
      const op = await inserirOp({
        produtoId: v.produtoId,
        variacaoId: v.variacaoId,
        quantidade,
        canalDestino: 'full_ml',
        remessaFullId: remessaId,
        status: 'em_producao',
        maquinaId,
        responsavelId: operadorId,
        dataRealInicio: new Date(),
        criadoPor,
      })
      await tx.insert(eventosKanban).values({
        ordemId: op.id,
        statusAnterior: 'programado',
        statusNovo: 'em_producao',
        usuarioId: operadorId,
        observacao: 'Entrou em produção ao ser pega pelo operador',
      })
      return op
    },

    /** Item da fila de reposição, já em produção pela OP. */
    async reposicaoEmProducao(v: Variacao, ordemId: string, marcadoPor: string) {
      const [r] = await tx
        .insert(reposicoesEstoque)
        .values({
          produtoId: v.produtoId,
          variacaoId: v.variacaoId,
          situacao: 'acabando',
          estado: 'em_producao',
          ordemId,
          marcadoPor,
          observacao: MARCA,
        })
        .returning({ id: reposicoesEstoque.id })
      return r.id
    },
  }
}

export type Fabrica = ReturnType<typeof criarFabrica>
