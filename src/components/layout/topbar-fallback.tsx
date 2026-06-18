// Fallback síncrono do Topbar — usado pelo Suspense enquanto a query
// de notificações resolve. Mantém o mesmo layout/altura pra evitar
// pulo visual.

import { Logo } from '@/components/brand/logo'
import { Bell, Search } from 'lucide-react'

import { MobileNav } from '@/components/layout/mobile-nav'
import { Button } from '@/components/ui/button'
import type { AreaKey } from '@/lib/auth/permissoes'
import type { User } from '@/lib/db/schema'

import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

export function TopbarFallback({
  user,
  bloqueadas,
}: {
  user: Pick<User, 'nome' | 'username' | 'role'>
  bloqueadas: AreaKey[]
}) {
  return (
    <header className="border-border bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-30 flex h-[calc(3.5rem_+_var(--sa-top,env(safe-area-inset-top)))] shrink-0 items-center justify-between border-b pt-[var(--sa-top,env(safe-area-inset-top))] pl-[max(0.75rem,var(--sa-left,env(safe-area-inset-left)))] pr-[max(0.75rem,var(--sa-right,env(safe-area-inset-right)))] backdrop-blur-md sm:pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))] sm:pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))]">
      <div className="flex items-center gap-2 md:hidden">
        <MobileNav bloqueadas={bloqueadas} />
        <Logo variant="mark" className="text-primary size-6" />
        <span className="font-heading text-sm font-medium tracking-[0.15em] uppercase">
          Vanvest
        </span>
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
