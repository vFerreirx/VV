'use client'

// Estado da navegação: sidebar oculta/visível e a largura dos dois painéis
// redimensionáveis (sidebar do desktop e gaveta do mobile). O botão mora na
// topbar e a <aside> é irmã dela, então o estado vive num contexto no topo
// do layout autenticado.
//
// Persistência em COOKIE (e não localStorage) porque o layout é Server
// Component: ele lê os cookies e já manda o HTML com a largura certa. Com
// localStorage a sidebar nasceria com a largura padrão e pularia depois que
// o JS rodasse — um flash em todo carregamento.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import {
  LARGURAS,
  naFaixa,
  SIDEBAR_COOKIE,
  type AlvoLargura,
} from '@/components/layout/sidebar-cookie'

const UM_ANO = 60 * 60 * 24 * 365

function gravar(nome: string, valor: string) {
  document.cookie = `${nome}=${valor}; path=/; max-age=${UM_ANO}; samesite=lax`
}

export type Larguras = Record<AlvoLargura, number>

type EstadoSidebar = {
  oculta: boolean
  alternar: () => void
  larguras: Larguras
  /** `teto` limita pela tela (a gaveta divide espaço com o celular). */
  definirLargura: (alvo: AlvoLargura, px: number, teto?: number) => void
}

const SidebarContext = createContext<EstadoSidebar>({
  oculta: false,
  alternar: () => {},
  larguras: { sidebar: LARGURAS.sidebar.padrao, gaveta: LARGURAS.gaveta.padrao },
  definirLargura: () => {},
})

export function useSidebar() {
  return useContext(SidebarContext)
}

export function SidebarProvider({
  ocultaInicial,
  largurasIniciais,
  children,
}: {
  ocultaInicial: boolean
  largurasIniciais: Larguras
  children: React.ReactNode
}) {
  const [oculta, setOculta] = useState(ocultaInicial)
  const [larguras, setLarguras] = useState(largurasIniciais)

  const alternar = useCallback(() => {
    setOculta((atual) => {
      const proxima = !atual
      gravar(SIDEBAR_COOKIE, proxima ? '1' : '0')
      return proxima
    })
  }, [])

  const definirLargura = useCallback((alvo: AlvoLargura, px: number, teto?: number) => {
    const nova = naFaixa(alvo, px, teto)
    setLarguras((atual) => (atual[alvo] === nova ? atual : { ...atual, [alvo]: nova }))
    gravar(LARGURAS[alvo].cookie, String(nova))
  }, [])

  // Atalho Ctrl/⌘ + B. Sem conflito com o Ctrl+K da busca global.
  useEffect(() => {
    function onKeyDown(evento: KeyboardEvent) {
      if (evento.key !== 'b' && evento.key !== 'B') return
      if (!(evento.ctrlKey || evento.metaKey)) return
      if (evento.altKey || evento.shiftKey) return
      evento.preventDefault()
      alternar()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [alternar])

  const valor = useMemo(
    () => ({ oculta, alternar, larguras, definirLargura }),
    [oculta, alternar, larguras, definirLargura],
  )

  return <SidebarContext.Provider value={valor}>{children}</SidebarContext.Provider>
}
