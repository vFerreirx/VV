// Constantes compartilhadas entre o layout (Server Component, que LÊ os
// cookies) e o provider/botão/resizer (client, que ESCREVEM). Módulo
// separado de propósito: num arquivo 'use client' todo export vira
// referência de client e uma string constante não chegaria inteira no
// servidor.

export const SIDEBAR_COOKIE = 'vv-sidebar-oculta'
export const SIDEBAR_LARGURA_COOKIE = 'vv-sidebar-largura'
export const SIDEBAR_ID = 'vv-sidebar'

/** 14rem — a largura de sempre, e o alvo do duplo clique no resizer. */
export const LARGURA_PADRAO = 224
export const LARGURA_MIN = 176
export const LARGURA_MAX = 400

export function larguraNaFaixa(px: number): number {
  return Math.round(Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, px)))
}

/** Cookie vem do navegador: trata lixo caindo no padrão. */
export function larguraDoCookie(bruto: string | undefined): number {
  const px = Number(bruto)
  if (!Number.isFinite(px)) return LARGURA_PADRAO
  return larguraNaFaixa(px)
}
