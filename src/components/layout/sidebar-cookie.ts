// Constantes compartilhadas entre o layout (Server Component, que LÊ os
// cookies) e o provider/botão/resizer (client, que ESCREVEM). Módulo
// separado de propósito: num arquivo 'use client' todo export vira
// referência de client e uma string constante não chegaria inteira no
// servidor.

export const SIDEBAR_COOKIE = 'vv-sidebar-oculta'
export const SIDEBAR_ID = 'vv-sidebar'

/**
 * Os dois painéis de navegação redimensionáveis: a sidebar do desktop e a
 * gaveta do mobile. Cada um tem seu cookie e sua faixa — a gaveta divide
 * espaço com uma tela de celular, a sidebar não.
 */
export const LARGURAS = {
  sidebar: {
    cookie: 'vv-sidebar-largura',
    variavel: '--vv-sidebar-w',
    // 14rem, a largura de sempre — e o alvo do duplo clique no resizer.
    padrao: 224,
    min: 176,
    max: 400,
    // Sem teto de viewport: no desktop 400px nunca engole a tela.
    fracaoDaTela: 0,
  },
  gaveta: {
    cookie: 'vv-gaveta-largura',
    variavel: '--vv-gaveta-w',
    // 18rem, o w-72 que a gaveta sempre teve.
    padrao: 288,
    min: 224,
    max: 420,
    // Espelha o `max-w-[85vw]` do painel: em tela pequena o limite real é
    // a tela, não o número fixo.
    fracaoDaTela: 0.85,
  },
} as const

export type AlvoLargura = keyof typeof LARGURAS

export function naFaixa(alvo: AlvoLargura, px: number, teto?: number): number {
  const { min, max } = LARGURAS[alvo]
  const limite = Math.max(min, Math.min(max, teto ?? max))
  return Math.round(Math.min(limite, Math.max(min, px)))
}

/** Cookie vem do navegador: trata lixo caindo no padrão. */
export function larguraDoCookie(
  alvo: AlvoLargura,
  bruto: string | undefined,
): number {
  const px = Number(bruto)
  if (!Number.isFinite(px)) return LARGURAS[alvo].padrao
  return naFaixa(alvo, px)
}
