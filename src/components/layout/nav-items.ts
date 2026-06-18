// Navegação compartilhada entre Sidebar (desktop) e MobileNav (drawer).
// Agrupada em seções pra não virar uma lista enorme. A visibilidade de cada
// item segue o mapa de permissões (áreas bloqueadas vêm do servidor).

import {
  Boxes,
  CalendarDays,
  Cog,
  Factory,
  Grid2x2,
  FileBarChart,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Package,
  Palette,
  Ruler,
  Shapes,
  ShieldCheck,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { AreaKey } from '@/lib/auth/permissoes'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  // Área de permissão. Itens sem área aparecem pra todo mundo autenticado.
  area?: AreaKey
}

export type NavGroup = {
  titulo: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    titulo: 'Geral',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      {
        href: '/relatorios',
        label: 'Relatório mensal',
        icon: FileBarChart,
        area: 'relatorios',
      },
    ],
  },
  {
    titulo: 'Produção',
    items: [
      { href: '/producao', label: 'Produção', icon: KanbanSquare, area: 'kanban' },
      { href: '/ordens', label: 'Ordens', icon: ListChecks, area: 'ordens' },
      {
        href: '/calendario',
        label: 'Calendário',
        icon: CalendarDays,
        area: 'calendario',
      },
    ],
  },
  {
    titulo: 'Fábrica',
    items: [
      { href: '/maquinas', label: 'Máquinas', icon: Factory, area: 'maquinas' },
      { href: '/estacoes', label: 'Estações', icon: Grid2x2, area: 'estacoes' },
    ],
  },
  {
    titulo: 'Estoque & Vendas',
    items: [
      { href: '/estoque', label: 'Estoque', icon: Boxes, area: 'estoque' },
      { href: '/vendas', label: 'Vendas', icon: ShoppingCart, area: 'vendas' },
    ],
  },
  {
    titulo: 'Catálogo',
    items: [
      { href: '/produtos', label: 'Produtos', icon: Package, area: 'produtos' },
      { href: '/cores', label: 'Cores', icon: Palette, area: 'cores' },
      { href: '/modelos', label: 'Modelos', icon: Shapes, area: 'modelos' },
      { href: '/tamanhos', label: 'Tamanhos', icon: Ruler, area: 'tamanhos' },
    ],
  },
  {
    titulo: 'Administração',
    items: [
      { href: '/usuarios', label: 'Usuários', icon: Users, area: 'usuarios' },
      {
        href: '/permissoes',
        label: 'Permissões',
        icon: ShieldCheck,
        area: 'permissoes',
      },
      { href: '/configuracoes', label: 'Configurações', icon: Cog },
    ],
  },
]

// Grupos filtrados pelas áreas bloqueadas do cargo (descarta grupos vazios).
export function visibleGroups(bloqueadas: AreaKey[] = []): NavGroup[] {
  const bloq = new Set(bloqueadas)
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !it.area || !bloq.has(it.area)),
  })).filter((g) => g.items.length > 0)
}
