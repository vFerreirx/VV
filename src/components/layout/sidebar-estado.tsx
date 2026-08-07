'use client'

// Estado da sidebar (oculta/visível e largura). O botão mora na topbar e a
// <aside> é irmã dela, então o estado vive num contexto no topo do layout
// autenticado.
//
// Persistência em COOKIE (e não localStorage) porque o layout é Server
// Component: ele lê os cookies e já manda o HTML com a largura certa. Com
// localStorage a sidebar nasceria com a largura padrão e pularia depois que
// o JS rodasse — um flash em todo carregamento.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  larguraNaFaixa,
  SIDEBAR_COOKIE,
  SIDEBAR_LARGURA_COOKIE,
  LARGURA_PADRAO,
} from '@/components/layout/sidebar-cookie'

const UM_ANO = 60 * 60 * 24 * 365

function gravar(nome: string, valor: string) {
  document.cookie = `${nome}=${valor}; path=/; max-age=${UM_ANO}; samesite=lax`
}

type EstadoSidebar = {
  oculta: boolean
  alternar: () => void
  largura: number
  definirLargura: (px: number) => void
}

const SidebarContext = createContext<EstadoSidebar>({
  oculta: false,
  alternar: () => {},
  largura: LARGURA_PADRAO,
  definirLargura: () => {},
})

export function useSidebar() {
  return useContext(SidebarContext)
}

export function SidebarProvider({
  ocultaInicial,
  larguraInicial,
  children,
}: {
  ocultaInicial: boolean
  larguraInicial: number
  children: React.ReactNode
}) {
  const [oculta, setOculta] = useState(ocultaInicial)
  const [largura, setLargura] = useState(larguraInicial)

  const alternar = useCallback(() => {
    setOculta((atual) => {
      const proxima = !atual
      gravar(SIDEBAR_COOKIE, proxima ? '1' : '0')
      return proxima
    })
  }, [])

  const definirLargura = useCallback((px: number) => {
    const nova = larguraNaFaixa(px)
    setLargura(nova)
    gravar(SIDEBAR_LARGURA_COOKIE, String(nova))
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
    () => ({ oculta, alternar, largura, definirLargura }),
    [oculta, alternar, largura, definirLargura],
  )

  return (
    <SidebarContext.Provider value={valor}>{children}</SidebarContext.Provider>
  )
}
