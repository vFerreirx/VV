// Lista de items de navegação compartilhada entre Sidebar (desktop) e
// MobileNav (Sheet/drawer no mobile). Mantém um único lugar pra editar
// as rotas e respeitar roles.

import {
  CalendarDays,
  Cog,
  Factory,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Package,
  Palette,
  Ruler,
  Shapes,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { User } from '@/lib/db/schema'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  roles?: User['role'][]
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/cores', label: 'Cores', icon: Palette },
  { href: '/modelos', label: 'Modelos', icon: Shapes },
  { href: '/tamanhos', label: 'Tamanhos', icon: Ruler },
  { href: '/maquinas', label: 'Máquinas', icon: Factory },
  { href: '/producao', label: 'Produção', icon: KanbanSquare },
  { href: '/ordens', label: 'Ordens', icon: ListChecks },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays },
  { href: '/usuarios', label: 'Usuários', icon: Users, roles: ['admin'] },
  { href: '/configuracoes', label: 'Configurações', icon: Cog },
]

export function visibleItems(role: User['role']): NavItem[] {
  return NAV_ITEMS.filter((it) => !it.roles || it.roles.includes(role))
}
