// Fallback síncrono do Topbar — usado pelo Suspense enquanto a query
// de notificações resolve. Mantém o mesmo layout/altura pra evitar
// pulo visual.

import { Logo } from '@/components/brand/logo'
import { Bell } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { User } from '@/lib/db/schema'

import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

export function TopbarFallback({
  user,
}: {
  user: Pick<User, 'nome' | 'username' | 'role'>
}) {
  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2 md:hidden">
        <Logo variant="mark" className="text-primary size-6" />
        <span className="font-heading text-sm font-medium tracking-[0.15em] uppercase">
          Vanvest
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1">
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
