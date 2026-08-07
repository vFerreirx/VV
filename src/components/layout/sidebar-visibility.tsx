'use client'

// Sidebar visível/oculta. O botão mora na topbar e a <aside> é irmã dela,
// então o estado vive num contexto no topo do layout autenticado.
//
// Persistência em COOKIE (e não localStorage) porque o layout é Server
// Component: ele lê o cookie e já manda o HTML com a largura certa. Com
// localStorage a sidebar nasceria visível e sumiria depois que o JS
// rodasse — 224px piscando em todo carregamento.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { SIDEBAR_COOKIE } from '@/components/layout/sidebar-cookie'

const UM_ANO = 60 * 60 * 24 * 365

type SidebarOculta = { oculta: boolean; alternar: () => void }

const SidebarOcultaContext = createContext<SidebarOculta>({
  oculta: false,
  alternar: () => {},
})

export function useSidebarOculta() {
  return useContext(SidebarOcultaContext)
}

export function SidebarVisibilityProvider({
  inicial,
  children,
}: {
  inicial: boolean
  children: React.ReactNode
}) {
  const [oculta, setOculta] = useState(inicial)

  const alternar = useCallback(() => {
    setOculta((atual) => {
      const proxima = !atual
      document.cookie = `${SIDEBAR_COOKIE}=${proxima ? '1' : '0'}; path=/; max-age=${UM_ANO}; samesite=lax`
      return proxima
    })
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

  const valor = useMemo(() => ({ oculta, alternar }), [oculta, alternar])

  return (
    <SidebarOcultaContext.Provider value={valor}>
      {children}
    </SidebarOcultaContext.Provider>
  )
}
