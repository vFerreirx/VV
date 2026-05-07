import { UserMenu } from './user-menu'
import type { User } from '@/lib/db/schema'

export function Topbar({
  user,
}: {
  user: Pick<User, 'nome' | 'email' | 'role'>
}) {
  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between border-b px-4">
      <div className="md:hidden">
        <span className="font-semibold">Malharia</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <UserMenu user={user} />
      </div>
    </header>
  )
}
