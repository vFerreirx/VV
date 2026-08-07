// Constantes compartilhadas entre o layout (Server Component, que LÊ o
// cookie) e o provider/botão (client, que ESCREVE). Módulo separado de
// propósito: num arquivo 'use client' todo export vira referência de
// client e uma string constante não chegaria inteira no servidor.

export const SIDEBAR_COOKIE = 'vv-sidebar-oculta'
export const SIDEBAR_ID = 'vv-sidebar'
