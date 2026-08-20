// Navegação compartilhada entre Sidebar (desktop) e MobileNav (drawer).
// Agrupada em seções pra não virar uma lista enorme. A visibilidade de cada
// item segue o mapa de permissões (áreas bloqueadas vêm do servidor).

import {
  BookUser,
  Boxes,
  Building2,
  CalendarDays,
  Cog,
  Combine,
  Factory,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Package,
  PackageSearch,
  Ruler,
  Shapes,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Spool,
  Trash2,
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
  // Item que agrega várias áreas (página com sub-abas): visível se QUALQUER
  // uma das áreas não estiver bloqueada pro cargo.
  areas?: AreaKey[]
  // Item que ganha bolinha de aviso. Declarado aqui, e não checado por href
  // lá na Sidebar, pra o próximo aviso não virar um `if` escondido no meio
  // do render. O dado vem do layout; ver IndicadorTarefas.
  alerta?: 'tarefas'
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
      { href: '/producao', label: 'Produção', icon: KanbanSquare, area: 'kanban' },
      { href: '/ordens', label: 'Ordens', icon: ListChecks, area: 'ordens' },
      {
        href: '/remessas',
        label: 'Remessas Full',
        icon: PackageSearch,
        area: 'remessas',
      },
      {
        href: '/calendario',
        label: 'Calendário',
        icon: CalendarDays,
        area: 'calendario',
      },
      {
        href: '/fabrica',
        label: 'Fábrica',
        icon: Factory,
        areas: ['maquinas', 'estacoes'],
      },
    ],
  },
  {
    titulo: 'Estoque & Vendas',
    items: [
      { href: '/estoque', label: 'Estoque', icon: Boxes, area: 'estoque' },
      {
        href: '/estoque-fios',
        label: 'Estoque de fios',
        icon: Spool,
        area: 'estoqueFios',
      },
      { href: '/vendas', label: 'Vendas', icon: ShoppingCart, area: 'vendas' },
      {
        href: '/pedidos',
        label: 'Pedidos',
        icon: FileText,
        area: 'vendas',
      },
      {
        href: '/clientes',
        label: 'Clientes',
        icon: BookUser,
        // A chave da área continua 'compradores' (ver permissoes.ts).
        area: 'compradores',
      },
      {
        href: '/contas-marketplace',
        label: 'Contas de marketplace',
        icon: Store,
        area: 'contasMarketplace',
      },
    ],
  },
  {
    titulo: 'Catálogo',
    items: [
      { href: '/produtos', label: 'Produtos', icon: Package, area: 'produtos' },
      { href: '/kits', label: 'Kits', icon: Combine, area: 'produtos' },
      {
        href: '/precos-marketplace',
        label: 'Preços de marketplace',
        icon: Tags,
        area: 'precosMarketplace',
      },
      {
        href: '/variacoes',
        label: 'Variações',
        icon: Shapes,
        areas: ['cores', 'modelos', 'tamanhos'],
      },
      {
        href: '/faixas-embalagem',
        label: 'Faixas de embalagem',
        icon: Ruler,
        area: 'faixasEmbalagem',
      },
    ],
  },
  {
    titulo: 'Administração',
    items: [
      {
        href: '/tarefas',
        label: 'Tarefas',
        icon: ListTodo,
        area: 'tarefas',
        alerta: 'tarefas',
      },
      { href: '/empresas', label: 'Empresas', icon: Building2, area: 'empresas' },
      { href: '/usuarios', label: 'Usuários', icon: Users, area: 'usuarios' },
      {
        href: '/permissoes',
        label: 'Permissões',
        icon: ShieldCheck,
        area: 'permissoes',
      },
      { href: '/lixeira', label: 'Lixeira', icon: Trash2, area: 'lixeira' },
      { href: '/configuracoes', label: 'Configurações', icon: Cog },
    ],
  },
]

// Grupos filtrados pelas áreas bloqueadas do cargo (descarta grupos vazios).
export function visibleGroups(bloqueadas: AreaKey[] = []): NavGroup[] {
  const bloq = new Set(bloqueadas)
  const visivel = (it: NavItem): boolean => {
    if (it.areas) return it.areas.some((a) => !bloq.has(a))
    if (it.area) return !bloq.has(it.area)
    return true
  }
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(visivel),
  })).filter((g) => g.items.length > 0)
}
