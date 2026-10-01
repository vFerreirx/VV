// A REGRA DO PIN — pura, sem banco, sem segredo e sem React.
//
// Mora aqui, e não em pin.ts, porque pin.ts é `server-only` (lida com o hash)
// e a TELA também precisa da regra. Quando a regra só existia lá, o diálogo
// "Definir PIN" do quadro de operadores escreveu uma cópia própria — e a cópia
// perdeu as barras invertidas: `/^d{4}$/` só aceitava "dddd", e todo PIN de
// números caía em "O PIN precisa ter 4 números" (01/10/2026). O test:banco
// não viu, porque chama a action direto, sem passar pela tela.
//
// Agora há UMA regra: a tela e o servidor chamam as mesmas funções, e a frase
// que o servidor recusa é a frase que a tela mostra. pin.ts reexporta
// `erroDePin`, então nenhum import do servidor mudou.

export const TAMANHO_DO_PIN = 4

// PINs que não protegem ninguém. Não é uma lista de senhas fracas — é o
// mínimo pra que a troca rápida não vire "todo mundo usa 1234", que
// devolveria exatamente o problema de autoria que o PIN existe pra resolver.
const PROIBIDOS = new Set([
  '0000', '1111', '2222', '3333', '4444',
  '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '3210', '1212', '2121',
])

/** Por que este PIN não serve, ou null se serve. */
export function erroDePin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'O PIN precisa ter 4 números'
  if (PROIBIDOS.has(pin)) {
    return 'Esse PIN é fácil demais de adivinhar. Escolha outro.'
  }
  return null
}

/**
 * O que um campo de PIN guarda enquanto a pessoa digita: só dígitos, no
 * máximo quatro. O teclado numérico do celular ajuda, mas no computador o
 * campo aceitaria qualquer coisa — inclusive o que o navegador colar.
 */
export function soDigitosDoPin(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, TAMANHO_DO_PIN)
}
