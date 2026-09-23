// A FILA DE REPOSIÇÃO DE ESTOQUE — regra pura, sem banco.
//
// O /estoque deixou de mostrar saldo (nada registra saída, então o número era
// maior que o estoque real) e virou a lista de peças que alguém avisou que
// estão acabando. O item de produto PRODUZIDO termina em OP: "Produzir" liga
// uma OP de canal Estoque, e a baixa dessa OP marca o item como reposto. O de
// produto de PARCEIRO não vira OP: "Pedir ao parceiro" e depois "Chegou"
// (ver `proximoEstadoDoParceiro`, mais abaixo).
//
// ⚠️ AS DUAS TUPLAS TÊM CÓPIA NO BANCO: os CHECKs de
// supabase/sql/59_reposicoes_estoque.sql. Mexer aqui sem mexer lá faz o
// INSERT estourar com erro de constraint.

import type { StatusDaOrdem } from './destino-da-ordem'

export const SITUACOES_DE_REPOSICAO = ['acabando', 'acabou'] as const
export type SituacaoDeReposicao = (typeof SITUACOES_DE_REPOSICAO)[number]

export const ESTADOS_DE_REPOSICAO = [
  'aberto',
  'em_producao',
  'pedido_parceiro',
  'reposto',
  'descartado',
] as const
export type EstadoDeReposicao = (typeof ESTADOS_DE_REPOSICAO)[number]

/**
 * Os estados que ocupam a fila — os mesmos do predicado do índice único
 * `reposicoes_estoque_variacao_ativa_uidx` (59). 'pedido_parceiro' é ativo
 * como 'em_producao': saiu do "em aberto", e a peça ainda não chegou.
 */
export const ESTADOS_ATIVOS_DE_REPOSICAO = [
  'aberto',
  'em_producao',
  'pedido_parceiro',
] as const satisfies readonly EstadoDeReposicao[]

export const ROTULO_DA_SITUACAO: Record<SituacaoDeReposicao, string> = {
  acabando: 'Acabando',
  acabou: 'Acabou',
}

export const ROTULO_DO_ESTADO: Record<EstadoDeReposicao, string> = {
  aberto: 'Aberto',
  em_producao: 'Em produção',
  pedido_parceiro: 'Pedido ao parceiro',
  reposto: 'Reposto',
  descartado: 'Descartado',
}

/** Quantos dias a aba "Atendidos" olha pra trás. */
export const DIAS_DE_ATENDIDOS = 30

export function ehSituacaoValida(v: unknown): v is SituacaoDeReposicao {
  return (
    typeof v === 'string' &&
    (SITUACOES_DE_REPOSICAO as readonly string[]).includes(v)
  )
}

/**
 * Marcar de novo uma peça que já está na fila só pode PIORAR a situação:
 * "acabando" vira "acabou". O contrário seria alguém apagando o aviso de
 * outra pessoa sem ninguém ter produzido nada.
 */
export function podeSubirSituacao(
  atual: SituacaoDeReposicao,
  nova: SituacaoDeReposicao,
): boolean {
  return atual === 'acabando' && nova === 'acabou'
}

/**
 * A ordem da fila: "Acabou" antes de "Acabando" e, dentro de cada grupo, o
 * mais antigo primeiro — quem esperou mais é atendido antes.
 */
export function ordenarFila<
  T extends { situacao: string; marcadoEm: Date | string },
>(itens: readonly T[]): T[] {
  const peso = (s: string) => (s === 'acabou' ? 0 : 1)
  return [...itens].sort(
    (a, b) =>
      peso(a.situacao) - peso(b.situacao) ||
      new Date(a.marcadoEm).getTime() - new Date(b.marcadoEm).getTime(),
  )
}

// -----------------------------------------------------------------
// Produto de PARCEIRO: pede-se, não se produz
// -----------------------------------------------------------------
//
// Produto comprado pronto (src/lib/produtos/origem.ts) nunca vira OP, então o
// item dele não pode seguir o caminho aberto → em_producao → reposto, que é
// dirigido pela OP. O caminho dele é manual:
//
//     aberto ──"Pedir ao parceiro"──▶ pedido_parceiro ──"Chegou"──▶ reposto
//
// Sem OP ligada em nenhum ponto (os CHECKs da 59 e da 72 garantem).

export type AcaoDaReposicao = 'produzir' | 'pedir_parceiro'

/** O botão que o item mostra: "Produzir" ou "Pedir ao parceiro". */
export function acaoDaReposicao(origemDoProduto: string): AcaoDaReposicao {
  return origemDoProduto === 'parceiro' ? 'pedir_parceiro' : 'produzir'
}

/**
 * O próximo estado de um item de parceiro, ou null quando o passo não vale
 * daqui — pedir o que já foi pedido, ou dar "chegou" no que nunca foi pedido.
 * A action usa o estado atual como condição do UPDATE, então duas pessoas
 * clicando juntas não passam as duas.
 */
export function proximoEstadoDoParceiro(
  atual: EstadoDeReposicao,
  passo: 'pedir' | 'chegou',
): 'pedido_parceiro' | 'reposto' | null {
  if (passo === 'pedir') return atual === 'aberto' ? 'pedido_parceiro' : null
  return atual === 'pedido_parceiro' ? 'reposto' : null
}

/** O que importa da OP ligada pra decidir o estado do item. */
export type OpDaReposicao = {
  status: StatusDaOrdem
  excluida: boolean
  variacaoId: string | null
  canalDestino: string
}

/**
 * O estado do item DERIVADO da OP ligada — quem grava é
 * `sincronizarReposicaoDaOp` (src/lib/db/reposicao-da-op.ts), chamada em
 * todo caminho que muda a OP.
 *
 * - OP sumiu, foi cancelada, excluída, trocou de variação ou saiu do canal
 *   Estoque: ela não repõe mais esta peça, e o item volta pra fila.
 * - OP com baixa: a peça entrou no estoque — reposto.
 * - Qualquer outro status: em produção (inclusive a baixa desfeita).
 */
export function estadoDaReposicaoPelaOp(
  op: OpDaReposicao | null,
  variacaoDoItem: string,
): 'aberto' | 'em_producao' | 'reposto' {
  if (
    op === null ||
    op.excluida ||
    op.status === 'cancelado' ||
    op.variacaoId !== variacaoDoItem ||
    op.canalDestino !== 'estoque'
  ) {
    return 'aberto'
  }
  return op.status === 'enviado' ? 'reposto' : 'em_producao'
}
