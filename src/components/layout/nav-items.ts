// Navegação compartilhada entre Sidebar (desktop) e MobileNav (drawer).
// Agrupada em seções pra não virar uma lista enorme.

import {
  Boxes,
  CalendarDays,
  Cog,
  Factory,
  Grid2x2,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Package,
  Palette,
  Ruler,
  Shapes,
  ShoppingCart,
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

export type NavGroup = {
  titulo: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    titulo: 'Geral',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    titulo: 'Produção',
    items: [
      { href: '/producao', label: 'Produção', icon: KanbanSquare },
      { href: '/ordens', label: 'Ordens', icon: ListChecks },
      { href: '/calendario', label: 'Calendário', icon: CalendarDays },
    ],
  },
  {
    titulo: 'Fábrica',
    items: [
      { href: '/maquinas', label: 'Máquinas', icon: Factory },
      {
        href: '/estacoes',
        label: 'Estações',
        icon: Grid2x2,
        roles: ['admin', 'gerente_producao'],
      },
    ],
  },
  {
    titulo: 'Estoque & Vendas',
    items: [
      {
        href: '/estoque',
        label: 'Estoque',
        icon: Boxes,
        roles: ['admin', 'gerente_producao', 'estoquista'],
      },
      {
        href: '/vendas',
        label: 'Vendas',
        icon: ShoppingCart,
        roles: ['admin', 'gerente_producao', 'vendas'],
      },
    ],
  },
  {
    titulo: 'Catálogo',
    items: [
      { href: '/produtos', label: 'Produtos', icon: Package },
      { href: '/cores', label: 'Cores', icon: Palette },
      { href: '/modelos', label: 'Modelos', icon: Shapes },
      { href: '/tamanhos', label: 'Tamanhos', icon: Ruler },
    ],
  },
  {
    titulo: 'Administração',
    items: [
      { href: '/usuarios', label: 'Usuários', icon: Users, roles: ['admin'] },
      { href: '/configuracoes', label: 'Configurações', icon: Cog },
    ],
  },
]

// Grupos filtrados por role (descarta grupos que ficaram vazios).
export function visibleGroups(role: User['role']): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.roles || it.roles.includes(role)),
  })).filter((g) => g.items.length > 0)
}
