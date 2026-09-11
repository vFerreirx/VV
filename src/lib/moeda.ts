// MÁSCARA DE MOEDA BRL — o teclado, o que vai pro servidor e o que volta.
//
// Três funções que existiam COPIADAS em quatro arquivos: o builder do pedido
// (pedidos/orcamentos-view.tsx), o cadastro de kit (kits/kits-view.tsx), a
// tela de vendas (vendas/vendas-view.tsx) e o form de produto
// (components/forms/produto-form.tsx). Os comentários de duas delas já diziam
// "igual à do builder do pedido... os três falam a mesma língua" — a cópia
// era conhecida e conferida à mão.
//
// ⚠️ E AS CÓPIAS JÁ TINHAM DIVERGIDO, em silêncio e só no caso vazio:
//
//   - `moedaParaDecimal('')` devolvia `''` no pedido e `undefined` em vendas;
//   - `decimalParaMoeda('')` devolvia **'0,00'** no pedido e `''` nas outras
//     três — ou seja, campo vazio virava "zero reais" numa tela e continuava
//     vazio nas outras.
//
// Aqui vale o comportamento das TRÊS: vazio entra, vazio sai. A diferença
// nunca apareceu porque todos os call sites do pedido já guardavam o vazio
// antes de chamar (`dados?.freteValor ? … : ''`) — mas a próxima tela que
// copiasse a função erraria a moeda de um jeito que passa na conferência.
//
// ⚠️ VAZIO NÃO É ZERO, e essa é a regra que amarra tudo: campo em branco
// significa "não informado", e informar zero é outra coisa. O mesmo
// raciocínio de `temFrete` em src/lib/total-pedido.ts, onde um "R$ 0,00"
// impresso seria a afirmação "o frete é por nossa conta".

/**
 * Digita números, eles preenchem da direita (centavos): "123456" → "1.234,56".
 *
 * Aceita o valor já mascarado de volta — a máscara é idempotente, que é o
 * que permite ligá-la direto no `onChange` do input sem estado paralelo.
 */
export function mascararMoeda(valor: string): string {
  const digits = valor.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * A máscara ("1.234,56") vira o decimal que o servidor espera ("1234.56") —
 * o formato de `numeric(12,2)`.
 *
 * Vazio devolve `''`, e não `'0.00'`: quem grava decide o que fazer com a
 * ausência (quase sempre `|| null`), e um zero inventado aqui viraria um
 * valor afirmado no banco.
 */
export function moedaParaDecimal(masked: string): string {
  const digits = masked.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toFixed(2)
}

/**
 * O decimal salvo ("1234.56") vira a máscara de exibição ("1.234,56").
 *
 * Aceita `null`/`undefined` porque é isso que vem das colunas opcionais
 * (`frete_valor`, preço de kit não cadastrado) — e nesses casos devolve
 * vazio, nunca "0,00".
 */
export function decimalParaMoeda(dec: string | null | undefined): string {
  if (dec == null || dec === '') return ''
  const cents = Math.round(Number(dec) * 100)
  if (!Number.isFinite(cents)) return ''
  return mascararMoeda(String(cents))
}
