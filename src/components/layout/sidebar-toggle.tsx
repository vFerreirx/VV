'use client'

// Botão de ocultar/mostrar a sidebar. Componente separado porque a Topbar
// (e o TopbarFallback) são Server Components — mesmo padrão do MobileNav e
// do NavLinkHint.
//
// `md:flex`: no mobile a navegação já é o sheet do MobileNav e a <aside>
// nem existe (hidden), então o botão não teria o que alternar.

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'

import { SIDEBAR_ID } from '@/components/layout/sidebar-cookie'
import { useSidebarOculta } from '@/components/layout/sidebar-visibility'
import { Button } from '@/components/ui/button'

export function SidebarToggle() {
  const { oculta, alternar } = useSidebarOculta()
  const rotulo = oculta ? 'Mostrar menu' : 'Ocultar menu'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={alternar}
      aria-label={rotulo}
      aria-expanded={!oculta}
      aria-controls={SIDEBAR_ID}
      title={`${rotulo} (Ctrl+B)`}
      className="hidden md:flex"
    >
      {oculta ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
  )
}
