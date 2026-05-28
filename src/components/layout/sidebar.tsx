'use client'

import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'

import { logoutAction } from '@/app/(auth)/login/actions'
import { Logo } from '@/components/brand/logo'
import { visibleItems } from '@/components/layout/nav-items'
import type { User } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

export function Sidebar({ role }: { role: User['role'] }) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const items = visibleItems(role)

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  return (
    <aside className="bg-sidebar border-sidebar-border hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="border-sidebar-border flex h-14 items-center gap-2.5 border-b px-4">
        <Logo variant="mark" className="text-sidebar-primary size-7" />
        <div className="leading-tight">
          <div className="text-sidebar-foreground font-heading text-sm font-medium tracking-[0.18em] uppercase">
            Vanvest
          </div>
          <div className="text-sidebar-foreground/60 text-[0.55rem] tracking-[0.3em] uppercase">
            Home Decor
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-sidebar-border border-t p-2">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className={cn(
            'text-sidebar-foreground hover:bg-sidebar-accent/50 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
            'disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          <LogOut className="size-4" />
          {isPending ? 'Saindo…' : 'Sair'}
        </button>
      </div>
    </aside>
  )
}
