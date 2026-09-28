// O que todo cenário recebe. Um cenário novo é um arquivo em
// tests/banco/cenarios/ que exporta um `Cenario`, mais uma linha na lista de
// tests/banco/index.ts.

import type { AuthUser } from '@/lib/auth/get-user'

import type { Actions } from './carregar'
import type { Placar } from './checagem'
import type { Tx } from './conexao'
import { escolherElenco, type Elenco } from './dados'
import { criarFabrica, type Fabrica } from './fabrica'
import { criarLeitura, type Leitura } from './leitura'
import type { Estado } from './mocks'
import { passarUmMinuto } from './relogio'

export type Contexto = {
  tx: Tx
  elenco: Elenco
  acoes: Actions
  placar: Placar
  fabrica: Fabrica
  ler: Leitura
  /** Troca quem o `requireAuth` das actions devolve. */
  como: (usuario: AuthUser) => void
  /** Entre uma action e outra — o porquê está em relogio.ts. */
  passarUmMinuto: () => Promise<void>
}

export type Cenario = {
  nome: string
  rodar: (ctx: Contexto) => Promise<void>
}

export async function montarContexto(
  tx: Tx,
  estado: Estado,
  acoes: Actions,
  placar: Placar,
): Promise<Contexto> {
  const opsDoTeste = new Set<string>()
  return {
    tx,
    elenco: await escolherElenco(tx),
    acoes,
    placar,
    fabrica: criarFabrica(tx, (id) => opsDoTeste.add(id)),
    ler: criarLeitura(tx),
    como: (usuario) => {
      estado.usuario = usuario
    },
    passarUmMinuto: () => passarUmMinuto(tx, [...opsDoTeste]),
  }
}
