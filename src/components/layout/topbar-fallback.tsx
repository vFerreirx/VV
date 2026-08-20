// Fallback síncrono do Topbar — usado pelo Suspense enquanto a query
// de notificações resolve. Mantém o mesmo layout/altura pra evitar
// pulo visual.

import { Logo } from '@/components/brand/logo'
import { Bell, Search } from 'lucide-react'

import { MobileNav } from '@/components/layout/mobile-nav'
import { SidebarToggle } from '@/components/layout/sidebar-toggle'
import { Button } from '@/components/ui/button'
import type { AreaKey } from '@/lib/auth/permissoes'
import type { PrioridadeAlerta } from '@/lib/prioridade'
import type { User } from '@/lib/db/schema'

import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

export function TopbarFallback({
  user,
  bloqueadas,
  alertaTarefas,
}: {
  user: Pick<User, 'nome' | 'username' | 'role'>
  bloqueadas: AreaKey[]
  alertaTarefas: PrioridadeAlerta
}) {
  return (
    <header
      data-slot="topbar"
      style={{ viewTransitionName: 'vv-topbar' }}
      className="border-border bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-30 flex h-[calc(3.5rem_+_var(--sa-top,env(safe-area-inset-top)))] shrink-0 items-center justify-between border-b pt-[var(--sa-top,env(safe-area-inset-top))] pl-[max(0.75rem,var(--sa-left,env(safe-area-inset-left)))] pr-[max(0.75rem,var(--sa-right,env(safe-area-inset-right)))] backdrop-blur-md sm:pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))] sm:pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))] print:hidden">
      {/* O botão de ocultar precisa existir aqui também: se só aparecesse
          no Topbar real, ele entraria depois do Suspense e a topbar daria
          um pulo — que é justamente o que este fallback existe pra evitar. */}
      <div className="flex items-center gap-2">
        <SidebarToggle />
        <div className="flex items-center gap-2 md:hidden">
          <MobileNav bloqueadas={bloqueadas} alertaTarefas={alertaTarefas} />
          <Logo variant="mark" className="text-primary size-6" />
          <span className="font-heading text-sm font-medium tracking-[0.15em] uppercase">
            Vanvest
          </span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Buscar" disabled>
          <Search />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Notificações"
          disabled
        >
          <Bell />
        </Button>
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
