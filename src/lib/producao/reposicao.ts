// A FILA DE REPOSIÇÃO DE ESTOQUE — regra pura, sem banco.
//
// O /estoque deixou de mostrar saldo (nada registra saída, então o número era
// maior que o estoque real) e virou a lista de peças que alguém avisou que
// estão acabando. O item de produto PRODUZIDO termina em OP: "Produzir" liga
// uma OP de canal Estoque, e a finalização dessa OP marca o item como reposto. O de
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
 * - OP finalizada: a peça entrou no estoque — reposto.
 * - Qualquer outro status: em produção (inclusive a conclusão desfeita).
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

// -----------------------------------------------------------------
// Marcar com quantidade, e as OPs saindo do mesmo diálogo (Q200–Q202)
// -----------------------------------------------------------------
//
// Quem passa pelas prateleiras é o GERENTE, e ele já sabe quantas produzir.
// Cada peça tocada no "Marcar peças" leva a quantidade e, pra quem pode criar
// OP, "Criar N OPs" cria todas NUMA TRANSAÇÃO SÓ — uma OP por peça, canal
// Estoque, ligada ao item. Tudo ou nada.
//
// O QUE ACONTECE COM CADA PEÇA é esta regra, e não um if na action: o
// diálogo a usa pra contar o botão ("Criar 6 OPs") e pra mostrar "já em
// produção", e a action a usa de novo, com o banco de agora, pra decidir.

export type DestinoDaMarcacao =
  /** Sem item ativo: cria o item e a OP ligada a ele. */
  | 'criar_item_e_op'
  /** Item aberto, marcado antes: grava situação e quantidade, e cria a OP. */
  | 'ligar_op_ao_item'
  /**
   * Só o item, com a quantidade: quem marcou não cria OP (a estoquista), ou
   * o produto é de parceiro, que nunca vira OP. Cria o item ou atualiza o
   * aberto.
   */
  | 'so_item'
  /** Já tem OP: nada novo. */
  | 'ja_em_producao'
  /** Já pedido ao parceiro: nada novo. */
  | 'ja_pedido_parceiro'

export function destinoDaMarcacao(
  ativo: { estado: (typeof ESTADOS_ATIVOS_DE_REPOSICAO)[number] } | null,
  origemDoProduto: string,
  criaOps: boolean,
): DestinoDaMarcacao {
  if (ativo?.estado === 'em_producao') return 'ja_em_producao'
  if (ativo?.estado === 'pedido_parceiro') return 'ja_pedido_parceiro'
  if (!criaOps || acaoDaReposicao(origemDoProduto) === 'pedir_parceiro') {
    return 'so_item'
  }
  return ativo === null ? 'criar_item_e_op' : 'ligar_op_ao_item'
}

/** Os destinos que terminam numa OP nova. */
export function viraOp(destino: DestinoDaMarcacao): boolean {
  return destino === 'criar_item_e_op' || destino === 'ligar_op_ao_item'
}

/** Os destinos em que a peça ganha campo de quantidade no diálogo. */
export function pedeQuantidade(destino: DestinoDaMarcacao): boolean {
  return destino !== 'ja_em_producao' && destino !== 'ja_pedido_parceiro'
}

/**
 * A situação que o item fica depois de marcado de novo: só SOBE
 * (`podeSubirSituacao`). Tocar "Acabando" num item "Acabou" mantém "Acabou".
 */
export function situacaoDepoisDaMarcacao(
  atual: SituacaoDeReposicao | null,
  marcada: SituacaoDeReposicao,
): SituacaoDeReposicao {
  if (atual === null) return marcada
  return podeSubirSituacao(atual, marcada) ? marcada : atual
}

/**
 * A prioridade da OP pela situação (Q202): "Acabou" é alta, "Acabando" é
 * normal. Sem prazo — se precisar, o gerente ajusta no quadro.
 */
export function prioridadeDaSituacao(
  situacao: SituacaoDeReposicao,
): 'alta' | 'normal' {
  return situacao === 'acabou' ? 'alta' : 'normal'
}

/**
 * O texto do botão do diálogo. `ops` conta só as peças que viram OP;
 * `parceiro`, as de produto de parceiro (não viram OP); `itens`, as que vão
 * pra fila sem OP porque quem marca não cria (a estoquista).
 *
 * Num diálogo só há um produto, então `ops` e `parceiro` nunca vêm juntos —
 * mas a frase aguenta, se um dia vierem.
 */
export function rotuloDoBotaoDeMarcar({
  ops,
  parceiro,
  itens,
}: {
  ops: number
  parceiro: number
  itens: number
}): string {
  const partes: string[] = []
  if (ops > 0) partes.push(ops === 1 ? 'Criar 1 OP' : `Criar ${ops} OPs`)
  if (parceiro > 0) {
    const pecas = parceiro === 1 ? '1 peça' : `${parceiro} peças`
    partes.push(partes.length ? `marcar ${pecas} pro parceiro` : `Marcar ${pecas} pro parceiro`)
  }
  if (itens > 0) {
    const pecas = itens === 1 ? '1 peça' : `${itens} peças`
    partes.push(partes.length ? `marcar ${pecas}` : `Marcar ${pecas}`)
  }
  return partes.length ? partes.join(' e ') : 'Toque nas peças'
}

/**
 * Os números das OPs criadas, numa faixa: "OP-2026-0190 a 0195". O contador
 * do banco dá números seguidos numa transação só; se não vierem seguidos
 * (outra OP criada no meio por outra pessoa), lista um por um.
 */
export function faixaDeNumeros(numeros: readonly string[]): string {
  if (numeros.length === 0) return ''
  const ordenados = [...numeros].sort()
  const primeiro = ordenados[0]!
  if (ordenados.length === 1) return primeiro
  const partes = ordenados.map((n) => /^(.*-)(\d+)$/.exec(n))
  const prefixo = partes[0]?.[1]
  const seguidos =
    partes.every((m) => m !== null && m[1] === prefixo) &&
    partes.every(
      (m, i) => i === 0 || Number(m![2]) === Number(partes[i - 1]![2]) + 1,
    )
  if (!seguidos) return ordenados.join(', ')
  return `${primeiro} a ${partes[partes.length - 1]![2]}`
}
