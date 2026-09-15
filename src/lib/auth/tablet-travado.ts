import 'server-only'

import { cookies } from 'next/headers'

import {
  COOKIE_ATIVIDADE,
  COOKIE_OPERADOR,
  COOKIE_TRAVADO,
  ERRO_TABLET_TRAVADO,
  expirouPorInatividade,
} from './inatividade'

// A GUARDA DA TRAVA DO TABLET — o lado que VALE.
//
// A tela pede o PIN antes de gravar, mas tela é conveniência: o arquivo das
// actions é 'use server', então cada action é um endpoint alcançável sem
// passar por tela nenhuma. Quem recusa de verdade é isto.
//
// ⚠️ TODA ACTION DE ESCRITA QUE O OPERADOR ALCANÇA CHAMA
// `recusaSeTabletTravado()` — a lista e o porquê estão no topo de
// src/lib/auth/inatividade.ts. Action nova sem a guarda é a trava com uma
// porta aberta, e ninguém percebe até o registro sair no nome errado.
//
// A regra: sessão de OPERADOR e (`vv_travado` OU atividade vencida). Admin e
// gerente nunca travam — eles não têm o cookie de operador, e trabalham no
// desktop, onde meia hora lendo um relatório é normal.

/** A sessão atual é de operador com o tablet travado? */
export async function sessaoDeOperadorTravada(): Promise<boolean> {
  const jar = await cookies()
  if (jar.get(COOKIE_OPERADOR)?.value !== '1') return false
  if (jar.get(COOKIE_TRAVADO)?.value === '1') return true
  return expirouPorInatividade(jar.get(COOKIE_ATIVIDADE)?.value)
}

/**
 * Pra usar no topo das actions de escrita:
 *
 *     const travado = await recusaSeTabletTravado()
 *     if (travado) return travado
 *
 * Devolve o resultado de recusa pronto — com a frase que o cliente reconhece
 * pra abrir o "Quem é você?" — ou null quando pode seguir.
 */
export async function recusaSeTabletTravado(): Promise<{
  success: false
  error: string
} | null> {
  return (await sessaoDeOperadorTravada())
    ? { success: false, error: ERRO_TABLET_TRAVADO }
    : null
}

/**
 * O `Date.now()` do servidor, pra ir junto com a página. O tablet calcula a
 * diferença do relógio dele a partir deste número (`offsetDoRelogio`).
 * Função, e não `Date.now()` direto no componente de servidor: o lint de
 * pureza recusa relógio no corpo de componente, e aqui ele é justamente o
 * dado que a página precisa carregar.
 */
export function horaDoServidorAgora(): number {
  return Date.now()
}
