'use client'

import {
  Cog,
  Factory,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Package,
  Palette,
  Ruler,
  Shapes,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'

import { logoutAction } from '@/app/(auth)/login/actions'
import type { User } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

type Item = {
  href: string
  label: string
  icon: LucideIcon
  roles?: User['role'][]
}

const ITEMS: Item[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/cores', label: 'Cores', icon: Palette },
  { href: '/modelos', label: 'Modelos', icon: Shapes },
  { href: '/tamanhos', label: 'Tamanhos', icon: Ruler },
  { href: '/maquinas', label: 'Máquinas', icon: Factory },
  { href: '/producao', label: 'Produção', icon: KanbanSquare },
  { href: '/ordens', label: 'Ordens', icon: ListChecks },
  { href: '/usuarios', label: 'Usuários', icon: Users, roles: ['admin'] },
  { href: '/configuracoes', label: 'Configurações', icon: Cog },
]

export function Sidebar({ role }: { role: User['role'] }) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const items = ITEMS.filter((it) => !it.roles || it.roles.includes(role))

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  return (
    <aside className="bg-sidebar border-sidebar-border hidden w-56 shrink-0 flex-col border-r md:flex">
      <div className="border-sidebar-border flex h-14 items-center border-b px-5">
        <span className="text-sidebar-foreground font-semibold tracking-tight">
          Malharia
        </span>
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
