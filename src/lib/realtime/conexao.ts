// QUANDO A TELA PRECISA SE RECARREGAR SOZINHA — as regras da conexão ao vivo.
//
// O defeito que isto conserta: o canal do Supabase avisa quando conecta e
// quando cai, mas as mudanças que aconteceram ENQUANTO ele estava caído não
// são reenviadas depois. O caminho real, no chão de fábrica: o tablet fica
// ocioso, o Android suspende a aba, o socket morre, alguém conclui uma OP na
// outra estação, o operador toca na tela — e vê os cartões de meia hora atrás,
// sem nada dizendo que aquilo está velho. Para ele, "o sistema está errado".
//
// Duas perguntas, duas funções:
//
//   1. o canal acabou de VOLTAR de uma queda? → recarrega uma vez
//   2. a aba ficou escondida TEMPO DEMAIS? → recarrega ao voltar, mesmo sem
//      o socket ter acusado queda (o Android suspende sem avisar ninguém)
//
// ⚠️ NADA DE POLLING. Com o canal de pé, o evento chega — perguntar de tempos
// em tempos "mudou alguma coisa?" seria pagar o preço de novo em cada tela
// aberta, e o banco tem 30 vagas de conexão no projeto inteiro.
//
// Puro de propósito, e sem o alias `@/` nos imports: as regras têm teste que
// roda no runner do Node (`node --test --experimental-strip-types`), que não
// resolve o alias do tsconfig.

/**
 * 'inicial' é antes da primeira conexão — e existe justamente pra que a
 * primeira conexão NÃO recarregue nada: a página acabou de carregar com dado
 * fresco do servidor.
 */
export type EstadoDoCanal = 'inicial' | 'conectado' | 'caido'

/**
 * Os status do supabase-js que significam "o canal caiu".
 *
 * CLOSED entra na lista porque é o que aparece quando o navegador congela a
 * aba: o socket é encerrado sem erro nenhum, e sem isto a volta pareceria a
 * primeira conexão (que não recarrega).
 */
export const STATUS_DE_QUEDA = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as const

export type TransicaoDoCanal = {
  estado: EstadoDoCanal
  conectado: boolean
  /** Voltou de uma queda: a tela precisa se atualizar UMA vez. */
  recarregar: boolean
}

/**
 * O que fazer com o `status` que o canal acabou de reportar.
 *
 * ⚠️ A RECARGA SÓ NASCE NA VOLTA ('caido' → SUBSCRIBED). Status repetido não
 * acumula nada: duas quedas seguidas sem volta no meio continuam sendo uma
 * queda só, e reconectar depois recarrega uma vez, não duas.
 */
export function proximoEstadoDoCanal(
  anterior: EstadoDoCanal,
  status: string,
): TransicaoDoCanal {
  if (status === 'SUBSCRIBED') {
    return {
      estado: 'conectado',
      conectado: true,
      // Só a VOLTA recarrega. A primeira conexão, não.
      recarregar: anterior === 'caido',
    }
  }

  if ((STATUS_DE_QUEDA as readonly string[]).includes(status)) {
    return { estado: 'caido', conectado: false, recarregar: false }
  }

  // Qualquer outro status (o 'SUBSCRIBING' do meio do caminho, por exemplo)
  // não muda nada: o canal ainda não disse se conseguiu.
  return {
    estado: anterior,
    conectado: anterior === 'conectado',
    recarregar: false,
  }
}

/**
 * Tempo escondida a partir do qual voltar à aba já pede recarga.
 *
 * DOIS MINUTOS é o tempo em que o Android suspende a aba em segundo plano e o
 * socket morre sem que ninguém seja avisado — o caso em que não há evento
 * guardado pra reprocessar, porque os eventos se perderam junto com a
 * conexão. Abaixo disso é troca de aba normal (olhar uma nota, responder uma
 * mensagem), e recarregar aí seria desperdício em toda alternância.
 */
export const MS_ESCONDIDA = 2 * 60 * 1000

export function precisaRecarregarAoVoltar(
  msEscondida: number,
  limite: number = MS_ESCONDIDA,
): boolean {
  return msEscondida >= limite
}
