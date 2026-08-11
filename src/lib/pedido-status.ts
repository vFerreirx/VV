// O caminho que um pedido percorre, e quais passos são legais a partir de
// onde ele está.
//
// Módulo PURO e compartilhado de propósito: a MESMA função decide o que o
// dropdown da lista oferece e o que a action aceita. Se a tela oferecesse
// uma transição que a action recusa, o usuário levaria um erro sem entender
// o que fez de errado — e o contrário (action mais frouxa que a tela) abre
// pulo de etapa por qualquer chamada fora da UI.
//
// FLUXO LINEAR COM VOLTA: anda UMA casa por vez, pra frente ou pra trás.
// Não existe pular etapa — "aguardando" não vira "finalizado" direto. Voltar
// existe porque clique errado acontece, não porque o pedido regride de
// verdade.
//
// NADA é automático: abrir a via de separação não muda status nenhum. Quem
// separou confirma na tela de pedidos.

/**
 * A ordem é o fluxo, e o índice nela é o que define vizinhança. Também é a
 * ordem interna do enum `orcamento_status` no Postgres
 * (`supabase/sql/41_orcamento_status.sql`) — mantenha as duas iguais, senão
 * qualquer ORDER BY por status no banco discorda desta lista.
 */
export const FLUXO_PEDIDO = [
  'aguardando',
  'aprovado',
  'separado',
  'finalizado',
] as const

export type StatusPedido = (typeof FLUXO_PEDIDO)[number]

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  aguardando: 'Aguardando',
  aprovado: 'Aprovado',
  separado: 'Separado',
  finalizado: 'Finalizado',
}

export function ehStatusPedido(valor: unknown): valor is StatusPedido {
  return (
    typeof valor === 'string' &&
    (FLUXO_PEDIDO as readonly string[]).includes(valor)
  )
}

export function rotuloDoStatus(status: StatusPedido): string {
  return ROTULO_STATUS[status]
}

/**
 * Os status que se pode alcançar a partir de `atual`: o anterior e o
 * próximo, quando existem. Vêm na ordem do fluxo (o de trás primeiro), pra
 * que o menu leia igual à régua. São no máximo dois — um só nas pontas.
 */
export function statusAlcancaveis(atual: StatusPedido): StatusPedido[] {
  const i = FLUXO_PEDIDO.indexOf(atual)
  if (i < 0) return []
  const vizinhos: StatusPedido[] = []
  const anterior = FLUXO_PEDIDO[i - 1]
  const proximo = FLUXO_PEDIDO[i + 1]
  if (anterior) vizinhos.push(anterior)
  if (proximo) vizinhos.push(proximo)
  return vizinhos
}

export function transicaoValida(de: StatusPedido, para: StatusPedido): boolean {
  return statusAlcancaveis(de).includes(para)
}

/**
 * Mensagem de recusa, ou `null` quando a transição vale. A action usa isto
 * pra explicar o "não" em vez de devolver um erro genérico.
 */
export function erroDeTransicao(
  de: StatusPedido,
  para: StatusPedido,
): string | null {
  if (de === para) return `O pedido já está em "${ROTULO_STATUS[de]}"`
  if (transicaoValida(de, para)) return null
  const alcancaveis = statusAlcancaveis(de)
    .map((s) => `"${ROTULO_STATUS[s]}"`)
    .join(' ou ')
  return (
    `De "${ROTULO_STATUS[de]}" só dá pra ir pra ${alcancaveis} — ` +
    'o pedido anda uma etapa por vez'
  )
}
