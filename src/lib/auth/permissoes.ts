import type { User } from '@/lib/db/schema'

// -----------------------------------------------------------------
// Permissões de acesso por área — núcleo puro (sem DB, client-safe).
//
// Modelo: "acesso por área". O admin liga/desliga quais áreas cada cargo
// EDITÁVEL acessa. Dentro da área, quem cria/edita segue a regra fixa de
// cada ação (não muda aqui).
//
// Travados (não editáveis):
//   - admin  → sempre acesso total a tudo.
//   - gerente_producao → sempre o nível padrão (produção/cadastros inteiros).
//
// As overrides (liga/desliga) ficam no banco; ver permissoes-db.ts.
// -----------------------------------------------------------------

export type Role = User['role']

export const ROLES: Role[] = [
  'admin',
  'gerente_producao',
  'operador',
  'estoquista',
  'vendas',
]

// Cargos cujo acesso o admin pode editar.
export const ROLES_EDITAVEIS: Role[] = ['operador', 'estoquista', 'vendas']

export const ROLE_INFO: Record<Role, { label: string; resumo: string }> = {
  admin: {
    label: 'Administrador',
    resumo: 'Acesso e ações em tudo, sem restrição.',
  },
  gerente_producao: {
    label: 'Gerente de produção',
    resumo:
      'Controle total da produção e dos cadastros. Não gerencia usuários.',
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

export type Nivel = 'total' | 'ver' | 'proprio' | 'nenhum'

export const NIVEL_INFO: Record<Nivel, { label: string; descricao: string }> = {
  total: { label: 'Total', descricao: 'Ver, criar, editar e excluir' },
  ver: { label: 'Só ver', descricao: 'Apenas leitura, sem alterar' },
  proprio: { label: 'O que é dele', descricao: 'Age só na OP que pegou pra si' },
  nenhum: { label: 'Sem acesso', descricao: 'Não aparece no menu' },
}

export type AreaKey =
  | 'kanban'
  | 'ordens'
  | 'calendario'
  | 'maquinas'
  | 'estacoes'
  | 'estoque'
  | 'vendas'
  | 'produtos'
  | 'cores'
  | 'modelos'
  | 'tamanhos'
  | 'usuarios'
  | 'permissoes'

export type Area = {
  key: AreaKey
  secao: string
  label: string
  descricao: string
  href: string
  // Se false, ninguém além de admin/gerente é editável: os cargos editáveis
  // ficam fixos no nível padrão (usado em áreas sensíveis).
  editavel: boolean
  nivelPadrao: Record<Role, Nivel>
}

// Atalhos pra deixar a tabela legível.
const A = 'admin'
const G = 'gerente_producao'
const O = 'operador'
const E = 'estoquista'
const V = 'vendas'

function padrao(p: Partial<Record<Role, Nivel>>): Record<Role, Nivel> {
  return {
    admin: p[A] ?? 'total',
    gerente_producao: p[G] ?? 'nenhum',
    operador: p[O] ?? 'nenhum',
    estoquista: p[E] ?? 'nenhum',
    vendas: p[V] ?? 'nenhum',
  }
}

const verCatalogo = { [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' } as const

export const AREAS: Area[] = [
  {
    key: 'kanban',
    secao: 'Produção',
    label: 'Kanban de produção',
    descricao: 'Acompanhar e mover as OPs entre as etapas.',
    href: '/producao',
    editavel: true,
    nivelPadrao: padrao({ [G]: 'total', [O]: 'proprio', [E]: 'ver', [V]: 'ver' }),
  },
  {
    key: 'ordens',
    secao: 'Produção',
    label: 'Ordens de produção',
    descricao: 'Criar, editar e cancelar OPs.',
    href: '/ordens',
    editavel: true,
    nivelPadrao: padrao({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
  },
  {
    key: 'calendario',
    secao: 'Produção',
    label: 'Calendário',
    descricao: 'Eventos e compromissos da operação.',
    href: '/calendario',
    editavel: true,
    nivelPadrao: padrao({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'total' }),
  },
  {
    key: 'maquinas',
    secao: 'Fábrica',
    label: 'Máquinas',
    descricao: 'Cadastro e status das máquinas.',
    href: '/maquinas',
    editavel: true,
    nivelPadrao: padrao({ [G]: 'total', [O]: 'ver', [E]: 'ver', [V]: 'ver' }),
  },
  {
    key: 'estacoes',
    secao: 'Fábrica',
    label: 'Estações',
    descricao: 'Grupos de máquinas com operador dia/noite.',
    href: '/estacoes',
    editavel: false,
    nivelPadrao: padrao({ [G]: 'total' }),
  },
  {
    key: 'estoque',
    secao: 'Estoque & Vendas',
    label: 'Estoque',
    descricao: 'Saldo, entradas, saídas e ajustes.',
    href: '/estoque',
    editavel: true,
    nivelPadrao: padrao({ [G]: 'total', [E]: 'total' }),
  },
  {
    key: 'vendas',
    secao: 'Estoque & Vendas',
    label: 'Vendas',
    descricao: 'Registro diário de unidades e faturamento.',
    href: '/vendas',
    editavel: true,
    nivelPadrao: padrao({ [G]: 'total', [V]: 'total' }),
  },
  {
    key: 'produtos',
    secao: 'Catálogo',
    label: 'Produtos',
    descricao: 'Produtos e suas variações.',
    href: '/produtos',
    editavel: true,
    nivelPadrao: padrao(verCatalogo),
  },
  {
    key: 'cores',
    secao: 'Catálogo',
    label: 'Cores',
    descricao: 'Catálogo de cores.',
    href: '/cores',
    editavel: true,
    nivelPadrao: padrao(verCatalogo),
  },
  {
    key: 'modelos',
    secao: 'Catálogo',
    label: 'Modelos',
    descricao: 'Catálogo de modelos.',
    href: '/modelos',
    editavel: true,
    nivelPadrao: padrao(verCatalogo),
  },
  {
    key: 'tamanhos',
    secao: 'Catálogo',
    label: 'Tamanhos',
    descricao: 'Catálogo de tamanhos.',
    href: '/tamanhos',
    editavel: true,
    nivelPadrao: padrao(verCatalogo),
  },
  {
    key: 'usuarios',
    secao: 'Administração',
    label: 'Usuários',
    descricao: 'Criar usuários, definir cargo e senha.',
    href: '/usuarios',
    editavel: false,
    nivelPadrao: padrao({}),
  },
  {
    key: 'permissoes',
    secao: 'Administração',
    label: 'Permissões',
    descricao: 'Editar o acesso dos cargos (esta tela).',
    href: '/permissoes',
    editavel: false,
    nivelPadrao: padrao({}),
  },
]

export const AREA_MAP: Record<AreaKey, Area> = Object.fromEntries(
  AREAS.map((a) => [a.key, a]),
) as Record<AreaKey, Area>

// -----------------------------------------------------------------
// Overrides + nível efetivo
// -----------------------------------------------------------------

// Liga/desliga por (cargo editável, área editável). Chave: `${role}__${area}`.
export type OverridesAcesso = Record<string, boolean>

export function chaveOverride(role: Role, area: AreaKey): string {
  return `${role}__${area}`
}

// Nível que o cargo recebe quando a área está liberada. Se o padrão já é um
// acesso (ver/proprio/total) usamos ele; se o padrão é "nenhum", liberar
// concede leitura ('ver').
export function nivelConcedido(area: Area, role: Role): Nivel {
  const base = area.nivelPadrao[role]
  return base !== 'nenhum' ? base : 'ver'
}

export function nivelEfetivo(
  role: Role,
  areaKey: AreaKey,
  overrides: OverridesAcesso,
): Nivel {
  const area = AREA_MAP[areaKey]
  if (!area) return 'nenhum'
  if (role === 'admin') return 'total'
  if (role === 'gerente_producao') return area.nivelPadrao.gerente_producao

  // Cargos editáveis (operador/estoquista/vendas).
  if (!area.editavel) return area.nivelPadrao[role]

  const liberadoPadrao = area.nivelPadrao[role] !== 'nenhum'
  const ov = overrides[chaveOverride(role, areaKey)]
  const liberado = ov === undefined ? liberadoPadrao : ov
  return liberado ? nivelConcedido(area, role) : 'nenhum'
}

// Áreas que o cargo NÃO acessa (nível nenhum) — pra esconder do menu.
export function areasBloqueadasDoRole(
  role: Role,
  overrides: OverridesAcesso,
): AreaKey[] {
  return AREAS.filter(
    (a) => nivelEfetivo(role, a.key, overrides) === 'nenhum',
  ).map((a) => a.key)
}
