import type { User } from '@/lib/db/schema'

// Mapa de permissões dos cargos — fonte única para a tela /permissoes.
// Reflete as regras reais aplicadas em requireRole/isManager e na
// visibilidade do menu (nav-items.ts). Se uma regra de acesso mudar no
// código, atualize aqui também.

export type Role = User['role']

export const ROLES: Role[] = [
  'admin',
  'gerente_producao',
  'operador',
  'estoquista',
  'vendas',
]

export const ROLE_INFO: Record<
  Role,
  { label: string; resumo: string }
> = {
  admin: {
    label: 'Administrador',
    resumo: 'Acesso e ações em tudo, sem restrição.',
  },
  gerente_producao: {
    label: 'Gerente de produção',
    resumo: 'Controle total da produção e dos cadastros. Não gerencia usuários.',
  },
  operador: {
    label: 'Operador',
    resumo: 'Pega a OP pra si e movimenta/aponta a produção que é dele.',
  },
  estoquista: {
    label: 'Estoquista',
    resumo: 'Cuida do estoque: entradas, saídas e ajustes.',
  },
  vendas: {
    label: 'Vendas',
    resumo: 'Lança as vendas diárias e organiza o calendário.',
  },
}

// Níveis de acesso por área.
export type Nivel = 'total' | 'ver' | 'proprio' | 'nenhum'

export const NIVEL_INFO: Record<
  Nivel,
  { label: string; descricao: string }
> = {
  total: { label: 'Total', descricao: 'Ver, criar, editar e excluir' },
  ver: { label: 'Só ver', descricao: 'Apenas leitura, sem alterar' },
  proprio: { label: 'O que é dele', descricao: 'Age só na OP que pegou pra si' },
  nenhum: { label: 'Sem acesso', descricao: 'Não aparece no menu' },
}

export type AreaPermissao = {
  area: string
  descricao: string
  niveis: Record<Role, Nivel>
}

export type SecaoPermissao = {
  titulo: string
  areas: AreaPermissao[]
}

// Atalhos pra deixar a tabela legível.
const A = 'admin'
const G = 'gerente_producao'
const O = 'operador'
const E = 'estoquista'
const V = 'vendas'

function niveis(p: Partial<Record<Role, Nivel>>): Record<Role, Nivel> {
  return {
    admin: p[A] ?? 'total',
    gerente_producao: p[G] ?? 'nenhum',
    operador: p[O] ?? 'nenhum',
    estoquista: p[E] ?? 'nenhum',
    vendas: p[V] ?? 'nenhum',
  }
}

export const PERMISSOES: SecaoPermissao[] = [
  {
    titulo: 'Produção',
    areas: [
      {
        area: 'Kanban de produção',
        descricao: 'Acompanhar e mover as OPs entre as etapas.',
        niveis: niveis({ [G]: 'total', [O]: 'proprio', [E]: 'ver', [V]: 'ver' }),
      },
      {
        area: 'Ordens de produção',
        descricao: 'Criar, editar e cancelar OPs.',
        niveis: niveis({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
      },
      {
        area: 'Calendário',
        descricao: 'Eventos e compromissos da operação.',
        niveis: niveis({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'total' }),
      },
    ],
  },
  {
    titulo: 'Fábrica',
    areas: [
      {
        area: 'Máquinas',
        descricao: 'Cadastro e status das máquinas.',
        niveis: niveis({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
      },
      {
        area: 'Estações',
        descricao: 'Grupos de máquinas com operador dia/noite.',
        niveis: niveis({ [G]: 'total' }),
      },
    ],
  },
  {
    titulo: 'Estoque & Vendas',
    areas: [
      {
        area: 'Estoque',
        descricao: 'Saldo, entradas, saídas e ajustes.',
        niveis: niveis({ [G]: 'total', [E]: 'total' }),
      },
      {
        area: 'Vendas',
        descricao: 'Registro diário de unidades e faturamento.',
        niveis: niveis({ [G]: 'total', [V]: 'total' }),
      },
    ],
  },
  {
    titulo: 'Catálogo',
    areas: [
      {
        area: 'Produtos',
        descricao: 'Produtos e suas variações.',
        niveis: niveis({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
      },
      {
        area: 'Cores',
        descricao: 'Catálogo de cores.',
        niveis: niveis({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
      },
      {
        area: 'Modelos',
        descricao: 'Catálogo de modelos.',
        niveis: niveis({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
      },
      {
        area: 'Tamanhos',
        descricao: 'Catálogo de tamanhos.',
        niveis: niveis({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
      },
    ],
  },
  {
    titulo: 'Administração',
    areas: [
      {
        area: 'Usuários',
        descricao: 'Criar usuários, definir cargo e senha.',
        niveis: niveis({}),
      },
      {
        area: 'Configurações',
        descricao: 'Perfil e senha (cada um cuida do seu).',
        niveis: niveis({ [G]: 'total', [O]: 'total', [E]: 'total', [V]: 'total' }),
      },
    ],
  },
]
