import { listarNotificacoes } from '@/app/(app)/notificacoes/actions'
import { Logo } from '@/components/brand/logo'
import { MobileNav } from './mobile-nav'
import { NotificationBell } from './notification-bell'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'
import type { User } from '@/lib/db/schema'

export async function Topbar({
  user,
}: {
  user: Pick<User, 'nome' | 'username' | 'role'>
}) {
  // Server-render dos alertas atuais. O client component assina realtime
  // e atualiza sozinho conforme o estado muda.
  const notificacoes = await listarNotificacoes()

  return (
    <header className="border-border bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b px-3 backdrop-blur-md sm:px-4">
      <div className="flex items-center gap-2 md:hidden">
        <MobileNav role={user.role} />
        <Logo variant="mark" className="text-primary size-6" />
        <span className="font-heading text-sm font-medium tracking-[0.15em] uppercase">
          Vanvest
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell initial={notificacoes} />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
