// As formas de pagamento de um pedido, e o desconto à vista que vem junto.
//
// Módulo PURO e compartilhado de propósito, no mesmo molde de
// src/lib/pedido-status.ts: a MESMA lista monta os botões da tela e valida o
// que a server action aceita. Se a tela oferecesse uma forma que a action
// recusa, o usuário levaria um erro sem entender o que fez de errado.
//
// A FORMA É OPCIONAL. "Não informado" é a AUSÊNCIA (null), não um valor da
// lista — pedido antigo não afirma forma nenhuma, e o documento não imprime
// nada sobre pagamento quando ninguém escolheu.

/**
 * A lista ordenada das formas. A ORDEM importa por dois motivos:
 *
 *   - é a ordem em que os botões e o seletor aparecem na tela;
 *   - tem que bater com a ordem interna do enum `pagamento_forma` no
 *     Postgres (`supabase/sql/51_pagamento_pedido.sql`), senão um ORDER BY
 *     por forma no banco discorda desta lista.
 */
export const FORMAS_PAGAMENTO = ['pix', 'cartao', 'boleto', 'cheque'] as const

export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  cartao: 'Cartão',
  boleto: 'Boleto',
  cheque: 'Cheque',
}

export function ehFormaPagamento(valor: unknown): valor is FormaPagamento {
  return (
    typeof valor === 'string' &&
    (FORMAS_PAGAMENTO as readonly string[]).includes(valor)
  )
}

/**
 * O desconto à vista praticado hoje, em pontos percentuais.
 *
 * É SUGESTÃO, e só isso: escolher Pix preenche o campo quando ele está vazio
 * e para por aí — o percentual continua editável, e o que vale no pedido é o
 * que ficou GRAVADO nele. Mesma relação do preço de tabela com
 * `orcamento_itens.preco_unitario` (ver o topo de src/lib/preco.ts): mudar
 * este número não pode alterar pedido já salvo.
 */
export const DESCONTO_PIX_PADRAO = 5
