'use client'

// Drawer lateral pra navegação no mobile/tablet retrato. Substitui a
// Sidebar (que fica hidden md:flex) com a mesma lista de items.
// Auto-fecha ao navegar pra outra rota.

import { ChevronDown, LogOut, Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

import { logoutAction } from '@/app/(auth)/login/actions'
import { Logo } from '@/components/brand/logo'
import { visibleGroups } from '@/components/layout/nav-items'
import { useNavCollapse } from '@/components/layout/use-nav-collapse'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { User } from '@/lib/db/schema'
import { cn } from '@/lib/utils'

export function MobileNav({ role }: { role: User['role'] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const grupos = visibleGroups(role)
  const { collapsed, toggle } = useNavCollapse()

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Abrir menu"
            className="md:hidden"
          />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <div className="flex h-full flex-col pl-[var(--sa-left,env(safe-area-inset-left))]">
          <div className="border-border flex h-[calc(3.5rem_+_var(--sa-top,env(safe-area-inset-top)))] items-center gap-2.5 border-b px-4 pt-[var(--sa-top,env(safe-area-inset-top))]">
            <Logo variant="mark" className="text-primary size-7" />
            <div className="leading-tight">
              <div className="font-heading text-sm font-medium tracking-[0.18em] uppercase">
                Vanvest
              </div>
              <div className="text-muted-foreground text-[0.55rem] tracking-[0.3em] uppercase">
                Home Decor
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-3 overflow-y-auto p-2">
            {grupos.map((grupo) => {
              const fechado = collapsed[grupo.titulo]
              return (
                <div key={grupo.titulo} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => toggle(grupo.titulo)}
                    className="text-muted-foreground flex w-full items-center justify-between px-3 pb-0.5 text-[0.6rem] font-medium tracking-[0.12em] uppercase"
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
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                            active
                              ? 'bg-accent text-accent-foreground font-medium'
                              : 'hover:bg-accent/50',
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
          <div className="border-border border-t p-2">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isPending}
              className={cn(
                'hover:bg-accent/50 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                'disabled:pointer-events-none disabled:opacity-60',
              )}
            >
              <LogOut className="size-4" />
              {isPending ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
