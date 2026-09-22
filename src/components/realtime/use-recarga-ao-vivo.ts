'use client'

// RECARGA AO VIVO, COM ECONOMIA — um helper só pro tablet, o kanban, a
// /fabrica e o sino.
//
// Cada tela assinava o Realtime e chamava `router.refresh()` a CADA evento.
// Uma mudança numa OP virava uma avalanche: com 4 tablets, kanban, /fabrica e
// /dashboard abertos, eram 20 requisições e 177 consultas chegando juntas
// (medido em 17/09/2026) — e o banco aceita 15 conexões no projeto inteiro.
//
// O helper faz quatro coisas, iguais pras quatro telas:
//
//   1. AGRUPA: eventos que chegam em sequência viram UMA execução. Uma ação
//      costuma tocar a OP e a máquina juntas, e são dois eventos.
//   2. ESPALHA: cada tela espera um atraso aleatório (até 1,5 s) antes de
//      executar, pra telas diferentes não baterem no servidor no mesmo
//      instante.
//   3. ABA ESCONDIDA NÃO EXECUTA: guarda o pendente e executa UMA vez quando
//      a aba volta a ficar visível.
//   4. IGNORA O ECO: a tela que acabou de agir numa OP já recarregou pela
//      própria ação; o evento que essa gravação gera não precisa de outra
//      recarga. É por ID (`marcarEco`), e não "qualquer evento nos próximos
//      segundos" — uma mudança de OUTRA OP feita por outra pessoa no mesmo
//      instante continua chegando.
//   5. RECARREGA AO VOLTAR de uma queda de conexão, ou de um tempo longo com
//      a aba escondida. ⚠️ O QUE SE PERDEU NÃO VOLTA: o Supabase não reenvia
//      os eventos do período em que o canal esteve caído. Sem isto, o tablet
//      que dormiu acorda mostrando os cartões de meia hora atrás — e sem nada
//      dizendo que estão velhos. As regras estão em src/lib/realtime/conexao.ts.
//
// Quem decide SE o evento importa e O QUE fazer é a tela: `decidir` devolve
// um tipo de reação (ou null pra ignorar) e `executar` recebe todos os tipos
// acumulados na janela. O tablet usa isso pra separar "recarregar a tela" de
// "só recalcular os contadores".

import { useEffect, useRef, useState } from 'react'

import {
  precisaRecarregarAoVoltar,
  proximoEstadoDoCanal,
  type EstadoDoCanal,
} from '@/lib/realtime/conexao'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

export type EventoAoVivo = {
  tabela: string
  novo: Record<string, unknown> | null
  antigo: Record<string, unknown> | null
}

const JANELA_MS = 1000
const ESPALHAR_MS = 1500
const ECO_MS = 3000

// ─────────────────────────────────────────────────────────────────────────
// ECO — por aba do navegador, compartilhado entre as telas montadas
// ─────────────────────────────────────────────────────────────────────────

const ecos = new Map<string, number>()

/**
 * A tela vai gravar nestas linhas (OP, máquina): os eventos delas nos
 * próximos segundos são eco da própria ação e não geram outra recarga.
 * Chamar ANTES da action.
 */
export function marcarEco(...ids: (string | null | undefined)[]): void {
  const ate = Date.now() + ECO_MS
  for (const id of ids) if (id) ecos.set(id, ate)
}

function ehEco(evento: EventoAoVivo): boolean {
  const agora = Date.now()
  for (const [id, ate] of ecos) if (ate <= agora) ecos.delete(id)
  const id = evento.novo?.id ?? evento.antigo?.id
  return typeof id === 'string' && ecos.has(id)
}

// ─────────────────────────────────────────────────────────────────────────

/**
 * Assina as tabelas e executa, com agrupamento, espalhamento, aba escondida
 * e eco. Devolve se o canal está conectado.
 */
export function useRecargaAoVivo<T extends string>({
  canal,
  tabelas,
  decidir,
  executar,
  reacaoNaVolta,
}: {
  /** Nome único do canal nesta aba. */
  canal: string
  tabelas: readonly string[]
  /** O tipo de reação a este evento, ou null pra ignorar. */
  decidir: (evento: EventoAoVivo) => T | null
  /** Recebe os tipos acumulados na janela (nunca vazio). */
  executar: (tipos: ReadonlySet<T>) => void
  /**
   * A reação usada quando a tela volta de uma queda (ou de um sono longo) —
   * o tablet e o kanban recarregam a tela, o sino rebusca a lista.
   *
   * ⚠️ OBRIGATÓRIO DE PROPÓSITO: tela nova que esquecer disto não compila, em
   * vez de ficar velha em silêncio depois da primeira queda de Wi-Fi.
   */
  reacaoNaVolta: T
}): boolean {
  const [conectado, setConectado] = useState(true)
  // As funções mudam a cada render da tela; o canal não pode ser refeito por
  // isso. As refs guardam a versão mais nova, e o canal lê delas.
  const decidirRef = useRef(decidir)
  const executarRef = useRef(executar)
  const reacaoNaVoltaRef = useRef(reacaoNaVolta)
  useEffect(() => {
    decidirRef.current = decidir
    executarRef.current = executar
    reacaoNaVoltaRef.current = reacaoNaVolta
  })

  const chaveTabelas = tabelas.join(',')

  useEffect(() => {
    const pendentes = new Set<T>()
    let timer: ReturnType<typeof setTimeout> | null = null

    function disparar() {
      timer = null
      if (pendentes.size === 0) return
      // Escondida: guarda. O `visibilitychange` executa quando voltar.
      if (document.visibilityState === 'hidden') return
      const tipos = new Set(pendentes)
      pendentes.clear()
      executarRef.current(tipos)
    }

    function agendar(atrasoBase: number) {
      if (timer !== null) return
      timer = setTimeout(disparar, atrasoBase + Math.random() * ESPALHAR_MS)
    }

    // O estado do canal e o instante em que a aba sumiu vivem AQUI, e não em
    // estado do React: mudar qualquer um deles não deve re-renderizar a tela,
    // e o efeito não pode ser refeito por causa disso.
    let estadoDoCanal: EstadoDoCanal = 'inicial'
    let escondidaDesde: number | null = null

    /**
     * Marca a recarga da volta e deixa o agendamento de sempre cuidar dela.
     *
     * ⚠️ PASSA PELO MESMO `agendar`: três tablets reconectando juntos quando o
     * Wi-Fi da fábrica volta não podem bater no servidor no mesmo instante —
     * o jitter de até 1,5 s existe pra isso.
     */
    function recarregarPorConexao() {
      pendentes.add(reacaoNaVoltaRef.current)
      agendar(0)
    }

    function aoVoltar() {
      if (document.visibilityState === 'hidden') {
        escondidaDesde = Date.now()
        return
      }
      const quanto = escondidaDesde === null ? 0 : Date.now() - escondidaDesde
      escondidaDesde = null

      // ABA ESCONDIDA POR MUITO TEMPO: recarrega mesmo SEM evento guardado.
      // É o caso do tablet que dormiu — os eventos do período não existem
      // mais pra serem reprocessados.
      if (precisaRecarregarAoVoltar(quanto)) {
        recarregarPorConexao()
        return
      }
      if (pendentes.size > 0) agendar(0)
    }

    const supabase = createBrowserSupabase()
    let ch = supabase.channel(canal)
    for (const tabela of chaveTabelas.split(',')) {
      ch = ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabela },
        (payload) => {
          const novo = payload.new as Record<string, unknown> | null
          const evento: EventoAoVivo = {
            tabela,
            novo: novo && Object.keys(novo).length > 0 ? novo : null,
            antigo: (payload.old as Record<string, unknown> | null) ?? null,
          }
          if (ehEco(evento)) return
          const tipo = decidirRef.current(evento)
          if (tipo === null) return
          pendentes.add(tipo)
          agendar(JANELA_MS)
        },
      )
    }
    ch.subscribe((status) => {
      const t = proximoEstadoDoCanal(estadoDoCanal, status)
      estadoDoCanal = t.estado
      setConectado(t.conectado)
      // Voltou de uma queda: o que mudou nesse meio-tempo não vem por evento.
      if (t.recarregar) recarregarPorConexao()
    })
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      if (timer !== null) clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      supabase.removeChannel(ch)
    }
  }, [canal, chaveTabelas])

  return conectado
}
