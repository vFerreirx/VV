// O que todo cenário recebe. Um cenário novo é um arquivo em
// tests/banco/cenarios/ que exporta um `Cenario`, mais uma linha na lista de
// tests/banco/index.ts.

import type { AuthUser } from '@/lib/auth/get-user'
import { telaDoTablet, type TelaDoTablet } from '@/lib/producao/tela-do-tablet'

import type { Actions } from './carregar'
import type { Placar } from './checagem'
import type { Tx } from './conexao'
import { escolherElenco, type Elenco } from './dados'
import { criarFabrica, type Fabrica } from './fabrica'
import { criarLeitura, type Leitura } from './leitura'
import type { Estado } from './mocks'
import { paradasExistentes, passarTempo, recuoPara } from './relogio'

export type Contexto = {
  tx: Tx
  elenco: Elenco
  acoes: Actions
  placar: Placar
  fabrica: Fabrica
  ler: Leitura
  /** Troca quem o `requireAuth` e o `getCurrentUser` das actions devolvem. */
  como: (usuario: AuthUser) => void
  /**
   * Grava (ou apaga, com null) a estação DESTE APARELHO no pote de cookies,
   * como o "Este aparelho" faz. Sobrevive ao `como`, igual ao tablet.
   */
  noAparelho: (estacaoId: string | null) => void
  /** O valor do cookie da estação no pote, ou null. */
  estacaoNoAparelho: () => string | null
  /**
   * A tela do tablet montada COMO A /producao MONTA: estação do aparelho +
   * `listarEstacoesDoTablet()` + `telaDoTablet(param, …)`. Precisa de um
   * usuário com a área kanban.
   */
  telaDoTablet: (param?: string) => Promise<TelaDoTablet>
  /** Entre uma action e outra — o porquê está em relogio.ts. */
  passarTempo: () => Promise<void>
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
  diferencaDoRelogioMs: number,
): Promise<Contexto> {
  const opsDoTeste = new Set<string>()
  const elenco = await escolherElenco(tx)
  const est = elenco.estacoes.valor
  const maquinaIds = est ? [...est.casa.maquinas.map((m) => m.id), est.fora.maquina.id] : []
  const paradasDeAntes = await paradasExistentes(tx, maquinaIds)
  const cookie = acoes.aparelho.COOKIE_ESTACAO_DO_APARELHO

  return {
    tx,
    elenco,
    acoes,
    placar,
    fabrica: criarFabrica(tx, (id) => opsDoTeste.add(id)),
    ler: criarLeitura(tx),
    como: (usuario) => {
      estado.usuario = usuario
    },
    noAparelho: (estacaoId) => {
      if (estacaoId === null) estado.cookies.delete(cookie)
      else estado.cookies.set(cookie, estacaoId)
    },
    estacaoNoAparelho: () => estado.cookies.get(cookie) ?? null,
    telaDoTablet: async (param) => {
      const [aparelho, doTablet] = await Promise.all([
        acoes.aparelho.estacaoDoAparelho(),
        acoes.producao.listarEstacoesDoTablet(),
      ])
      return telaDoTablet(
        param,
        aparelho?.id ?? null,
        new Set(doTablet.estacoes.map((e) => e.id)),
      )
    },
    passarTempo: () =>
      passarTempo(tx, recuoPara(diferencaDoRelogioMs), {
        opIds: [...opsDoTeste],
        maquinaIds,
        paradasDeAntes,
      }),
  }
}
