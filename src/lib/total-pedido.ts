// O TOTAL DE UM PEDIDO — helper PURO, sem banco e sem React.
//
// ─────────────────────────────────────────────────────────────────────────
// SÃO TRÊS TOTAIS, E CONFUNDI-LOS QUEBRA COISA EM SILÊNCIO
// ─────────────────────────────────────────────────────────────────────────
//
//  1. `orcamento.total` — A MERCADORIA. Soma de `quantidade × preco_unitario`
//     dos itens, e SÓ isso. É o que várias telas já leem há tempo, e o que a
//     cotação de frete usa pra calcular o valor declarado. NÃO MUDE O SENTIDO
//     DELE: trocar o significado de um campo que já existe não quebra o
//     type-check, quebra o número na tela de quem confiava nele.
//
//  2. O TOTAL COM FRETE — mercadoria + frete, por `totalComFrete`. NÃO tem
//     desconto. É o número da coluna Total da lista de pedidos, e ele existe
//     desde antes do desconto.
//
//  3. O TOTAL FINAL — o que o cliente paga: mercadoria − desconto + frete,
//     por `totalFinal`. É o que sai no documento e no rodapé do diálogo.
//
// Os dois derivados são calculados NA LEITURA. Não existe coluna pra eles de
// propósito: um total gravado poderia divergir da soma dos itens, e aí não
// haveria como saber qual dos dois está errado. Pelo mesmo motivo o que se
// grava do desconto é o PERCENTUAL, nunca o valor em reais.
//
// O DESCONTO SÓ MORDE A MERCADORIA. Frete é custo repassado da
// transportadora — descontá-lo seria pagar parte do frete do cliente sem
// ninguém ter decidido isso.
//
// ONDE CADA UM VALE:
//
//   mercadoria  → valor declarado da cotação (src/lib/frete.ts: 40% da
//                 MERCADORIA — declarar frete no seguro da própria carga não
//                 faz sentido e ainda encarece a cotação);
//                 romaneio (documento de CARGA, não comercial: a coluna
//                 "Subtotal" tem que fechar se alguém somar no papel).
//   com frete   → a coluna Total da lista de pedidos, e só ela.
//   final       → documento do pedido (discriminado: subtotal, desconto,
//                 frete, total), rodapé do diálogo e painel de pagamento.
//
// ─────────────────────────────────────────────────────────────────────────
// UNIDADES
// ─────────────────────────────────────────────────────────────────────────
// `orcamento.total` é number em REAIS (já era), `orcamentos.frete_valor` é
// numeric(12,2) e `orcamentos.desconto_percentual` é numeric(5,2) — os dois
// chegam como string ("50.00", "5.00"). A conta acontece em CENTAVOS
// inteiros e só depois volta pra reais — somar 0.1 + 0.2 em ponto flutuante
// é o tipo de erro que aparece como "R$ 1.234,5699999" numa nota.

/** `frete_valor` (numeric(12,2) ou nulo) → centavos inteiros. */
export function freteEmCentavos(
  freteValor: string | number | null | undefined,
): number {
  if (freteValor == null || freteValor === '') return 0
  const n = Number(freteValor)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

/**
 * Tem frete informado?
 *
 * ZERO CONTA COMO "NÃO TEM", e isso é regra de tela: pedido sem frete não
 * pode mostrar "Frete R$ 0,00" no papel que vai pro cliente — uma linha
 * dizendo zero é uma afirmação, e a afirmação aqui seria "o frete é por nossa
 * conta". Sem valor a linha simplesmente não sai.
 */
export function temFrete(
  freteValor: string | number | null | undefined,
): boolean {
  return freteEmCentavos(freteValor) > 0
}

/**
 * Mercadoria + frete, em reais. Sem frete devolve a mercadoria intacta.
 *
 * SEM DESCONTO — é a coluna Total da lista de pedidos e nada mais. Quem quer
 * o que o cliente paga usa `totalFinal` logo abaixo.
 */
export function totalComFrete(
  totalMercadoria: number,
  freteValor: string | number | null | undefined,
): number {
  return (
    (Math.round(totalMercadoria * 100) + freteEmCentavos(freteValor)) / 100
  )
}

/**
 * `desconto_percentual` (numeric(5,2) ou nulo) → o número de pontos
 * percentuais, já limitado a 0–100. Fora da faixa, vazio ou lixo viram 0 —
 * "não tem desconto" —, que é o mesmo que o CHECK do banco garante na
 * escrita (`supabase/sql/51_pagamento_pedido.sql`).
 */
function percentualValido(
  descontoPercentual: string | number | null | undefined,
): number {
  if (descontoPercentual == null || descontoPercentual === '') return 0
  const n = Number(descontoPercentual)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 100)
}

/**
 * Quanto o desconto tira, em centavos inteiros.
 *
 * SÓ SOBRE A MERCADORIA, nunca sobre o frete: frete é custo repassado da
 * transportadora, e descontá-lo seria pagar parte do frete do cliente sem
 * ninguém ter decidido isso. Por isso esta função nem recebe o frete.
 */
export function descontoEmCentavos(
  totalMercadoria: number,
  descontoPercentual: string | number | null | undefined,
): number {
  const pct = percentualValido(descontoPercentual)
  if (pct === 0) return 0
  return Math.round((Math.round(totalMercadoria * 100) * pct) / 100)
}

/**
 * Tem desconto informado?
 *
 * ZERO CONTA COMO "NÃO TEM", pela mesma razão de `temFrete` logo acima:
 * "Desconto R$ 0,00" no papel do cliente é uma afirmação, e a afirmação aqui
 * seria "negociamos e não houve desconto". Ninguém disse isso — sem
 * percentual a linha simplesmente não sai.
 */
export function temDesconto(
  descontoPercentual: string | number | null | undefined,
): boolean {
  return percentualValido(descontoPercentual) > 0
}

/**
 * O QUE O CLIENTE PAGA: mercadoria − desconto + frete, em reais.
 *
 * Sem desconto e sem frete devolve a mercadoria intacta. É este o número do
 * documento e do rodapé do diálogo — se os dois divergirem, a divergência
 * aparece na frente do cliente.
 */
export function totalFinal(
  totalMercadoria: number,
  freteValor: string | number | null | undefined,
  descontoPercentual: string | number | null | undefined,
): number {
  const mercadoria = Math.round(totalMercadoria * 100)
  return (
    (mercadoria -
      descontoEmCentavos(totalMercadoria, descontoPercentual) +
      freteEmCentavos(freteValor)) /
    100
  )
}
