import { Logo } from '@/components/brand/logo'
import { GlobalSearch } from './global-search'
import { MobileNav } from './mobile-nav'
import { NotificationBell } from './notification-bell'
import { SidebarToggle } from './sidebar-toggle'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'
import type { AreaKey } from '@/lib/auth/permissoes'
import type { PrioridadeAlerta } from '@/lib/prioridade'
import type { User } from '@/lib/db/schema'

export function Topbar({
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
        <GlobalSearch />
        {/* O sino não existe no tablet do operador: lá a tela já mostra o
            que é da estação, e cada tablet ligado o dia inteiro seria mais
            um canal e mais uma consulta a cada mudança de OP da fábrica. */}
        {user.role !== 'operador' && <NotificationBell />}
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
