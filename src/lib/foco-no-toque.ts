// QUEM ABRIU O DIÁLOGO DECIDE SE O TECLADO SOBE — a regra pura, sem React e
// sem DOM, pra caber no teste de `regras.test.ts`. Quem a usa na tela é
// `src/components/ui/foco-no-toque.ts`.
//
// ⚠️ No tablet, campo de texto focado = teclado na tela, cobrindo metade do
// diálogo. Decisão do Vitor (01/10): diálogo aberto pelo TOQUE (dedo ou
// caneta) não foca campo nenhum; o teclado só sobe quando o operador toca no
// campo. Com mouse ou teclado físico, foca como sempre focou.

/** O que a Base UI passa pro `initialFocus` — `''` quando ela não sabe. */
export type TipoDeInteracao = 'mouse' | 'touch' | 'pen' | 'keyboard' | ''

/**
 * Se o foco tem que ficar LONGE dos campos de texto.
 *
 * `tipoDaBaseUi` só vem preenchido quando o diálogo abre pelo `Trigger` da
 * Base UI. Quase todos os nossos abrem por `open=` controlado (o toque cai
 * no cartão da máquina, que só muda um estado), e aí chega `''` — foi
 * exatamente o caso do "Iniciar na Máquina N". Por isso o vazio cai no
 * `ultimoGesto`, que é o último ponteiro/tecla visto na página.
 */
export function focoLongeDosCampos(
  tipoDaBaseUi: TipoDeInteracao,
  ultimoGesto: TipoDeInteracao,
): boolean {
  const tipo = tipoDaBaseUi || ultimoGesto
  return tipo === 'touch' || tipo === 'pen'
}
