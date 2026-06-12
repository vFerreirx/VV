'use client'

import { ChevronDown, LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

import { logoutAction } from '@/app/(auth)/login/actions'
import { Logo } from '@/components/brand/logo'
import { visibleGroups } from '@/components/layout/nav-items'
import { useNavCollapse } from '@/components/layout/use-nav-collapse'
import type { User } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

export function Sidebar({ role }: { role: User['role'] }) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const grupos = visibleGroups(role)
  const { collapsed, toggle } = useNavCollapse()

  // Indicator deslizante: mede a posição do item ativo e move uma barra.
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(
    null,
  )
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ativo = nav.querySelector<HTMLElement>('[data-active="true"]')
    if (!ativo) {
      setIndicator(null)
      return
    }
    setIndicator({ top: ativo.offsetTop, height: ativo.offsetHeight })
  }, [pathname, grupos.length, collapsed])

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
      <nav
        ref={navRef}
        className="relative flex-1 space-y-3 overflow-y-auto p-2"
      >
        {indicator && (
          <span
            aria-hidden
            className="bg-sidebar-primary absolute left-1 w-0.5 rounded-full transition-all duration-300 ease-out"
            style={{ top: indicator.top, height: indicator.height }}
          />
        )}
        {grupos.map((grupo) => {
          const fechado = collapsed[grupo.titulo]
          return (
            <div key={grupo.titulo} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggle(grupo.titulo)}
                className="text-sidebar-foreground/45 hover:text-sidebar-foreground/70 flex w-full items-center justify-between px-2.5 pb-0.5 text-[0.6rem] font-medium tracking-[0.12em] uppercase transition-colors"
              >
                {grupo.titulo}
                <ChevronDown
                  className={cn(
                    'size-3 transition-transform',
                    fechado && '-rotate-90',
                  )}
                />
              </button>
              {!fechado &&
                grupo.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-active={active}
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
            </div>
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
