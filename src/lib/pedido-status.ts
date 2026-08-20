// Os status que um pedido pode ter, e para onde ele pode ir a partir de cada
// um.
//
// Módulo PURO e compartilhado de propósito: a MESMA função decide o que o
// dropdown da lista oferece e o que a action aceita. Se a tela oferecesse uma
// transição que a action recusa, o usuário levaria um erro sem entender o que
// fez de errado — e o contrário (action mais frouxa que a tela) deixaria a
// regra valer só pra quem clica.
//
// TRANSIÇÃO LIVRE: qualquer status vira qualquer outro. A única coisa que não
// vale é o pedido "mudar" pro status em que já está. Foi linear com volta
// (andava uma casa por vez) até o commit 04b5d57; a ordem da lista continua
// existindo, mas parou de significar vizinhança.
//
// NADA é automático: abrir a via de separação não muda status nenhum. Quem
// separou confirma na tela de pedidos.

/**
 * A lista ordenada dos status — não um fluxo. Nenhuma transição depende da
 * posição de ninguém aqui. A ORDEM ainda importa por dois motivos:
 *
 *   - é a ordem em que o dropdown lista as opções;
 *   - tem que bater com a ordem interna do enum `orcamento_status` no
 *     Postgres (`supabase/sql/41_orcamento_status.sql` e
 *     `42_orcamento_status_cancelado.sql`), senão um ORDER BY por status no
 *     banco discorda desta lista.
 *
 * `cancelado` é o último de propósito, no enum e aqui: é estado de exceção,
 * não etapa, e intercalar no meio o faria parecer mais um passo do caminho.
 */
export const STATUS_PEDIDO = [
  'aguardando',
  'aprovado',
  'separado',
  'finalizado',
  'cancelado',
] as const

export type StatusPedido = (typeof STATUS_PEDIDO)[number]

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  aguardando: 'Aguardando',
  aprovado: 'Aprovado',
  separado: 'Separado',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
}

export function ehStatusPedido(valor: unknown): valor is StatusPedido {
  return typeof valor === 'string' && (STATUS_PEDIDO as readonly string[]).includes(valor)
}

// Estados que não são etapa do pedido, e sim exceção. A tela usa isto pra
// separar o item no menu em vez de cravar o nome do status na view — se
// aparecer outro (devolvido, extraviado), entra aqui e a tela acompanha.
const EXCECAO = new Set<StatusPedido>(['cancelado'])

export function ehExcecao(status: StatusPedido): boolean {
  return EXCECAO.has(status)
}

/**
 * Para onde este pedido pode ir: todos os status, menos o que ele já tem.
 * Na ordem de `STATUS_PEDIDO`, que é a ordem de exibição do menu.
 */
export function statusAlcancaveis(atual: StatusPedido): StatusPedido[] {
  return STATUS_PEDIDO.filter((s) => s !== atual)
}

export function transicaoValida(de: StatusPedido, para: StatusPedido): boolean {
  return ehStatusPedido(para) && de !== para
}

/**
 * Mensagem de recusa, ou `null` quando a transição vale. A action usa isto
 * pra explicar o "não" em vez de devolver um erro genérico. Com transição
 * livre sobrou um caso só, mas ele continua acontecendo: dois cliques
 * seguidos, ou a lista recarregada entre o clique e a resposta.
 */
export function erroDeTransicao(de: StatusPedido, para: StatusPedido): string | null {
  if (!ehStatusPedido(para)) return 'Status inválido'
  if (de === para) return `O pedido já está em "${ROTULO_STATUS[de]}"`
  return null
}
