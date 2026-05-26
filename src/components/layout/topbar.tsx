import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'
import type { User } from '@/lib/db/schema'

export function Topbar({
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
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
