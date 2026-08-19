// O TOTAL DE UM PEDIDO — helper PURO, sem banco e sem React.
//
// ─────────────────────────────────────────────────────────────────────────
// SÃO DOIS TOTAIS, E CONFUNDI-LOS QUEBRA COISA EM SILÊNCIO
// ─────────────────────────────────────────────────────────────────────────
//
//  1. `orcamento.total` — A MERCADORIA. Soma de `quantidade × preco_unitario`
//     dos itens, e SÓ isso. É o que várias telas já leem há tempo, e o que a
//     cotação de frete usa pra calcular o valor declarado. NÃO MUDE O SENTIDO
//     DELE: trocar o significado de um campo que já existe não quebra o
//     type-check, quebra o número na tela de quem confiava nele.
//
//  2. O TOTAL COM FRETE — derivado, calculado na leitura por `totalComFrete`.
//     É o que o cliente paga. Não existe coluna pra ele de propósito: um
//     total gravado poderia divergir da soma dos itens, e aí não haveria como
//     saber qual dos dois está errado.
//
// ONDE CADA UM VALE:
//
//   mercadoria  → valor declarado da cotação (src/lib/frete.ts: 40% da
//                 MERCADORIA — declarar frete no seguro da própria carga não
//                 faz sentido e ainda encarece a cotação);
//                 romaneio (documento de CARGA, não comercial: a coluna
//                 "Subtotal" tem que fechar se alguém somar no papel).
//   com frete   → documento do pedido (discriminado: subtotal, frete, total),
//                 rodapé do diálogo e a coluna Total da lista de pedidos.
//
// ─────────────────────────────────────────────────────────────────────────
// UNIDADES
// ─────────────────────────────────────────────────────────────────────────
// `orcamento.total` é number em REAIS (já era) e `orcamentos.frete_valor` é
// numeric(12,2), que chega como string ("50.00"). A soma acontece em CENTAVOS
// inteiros e só depois volta pra reais — somar 0.1 + 0.2 em ponto flutuante é
// o tipo de erro que aparece como "R$ 1.234,5699999" numa nota.

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

/** Mercadoria + frete, em reais. Sem frete devolve a mercadoria intacta. */
export function totalComFrete(
  totalMercadoria: number,
  freteValor: string | number | null | undefined,
): number {
  return (
    (Math.round(totalMercadoria * 100) + freteEmCentavos(freteValor)) / 100
  )
}
