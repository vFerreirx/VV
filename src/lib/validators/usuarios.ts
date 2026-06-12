import { z } from 'zod'

import { usernameSchema } from './auth'

export const userRoleValues = [
  'admin',
  'gerente_producao',
  'operador',
  'estoquista',
  'vendas',
] as const

const stringOpt = (max: number) =>
  z
    .string()
    .max(max, 'Texto muito longo')
    .optional()
    .or(z.literal('').transform(() => undefined))

// Paleta de cores pros operadores (hex). Distintas e legíveis.
export const OPERADOR_CORES = [
  '#ef4444', // vermelho
  '#f97316', // laranja
  '#f59e0b', // âmbar
  '#eab308', // amarelo
  '#84cc16', // lima
  '#22c55e', // verde
  '#14b8a6', // teal
  '#06b6d4', // ciano
  '#3b82f6', // azul
  '#6366f1', // índigo
  '#a855f7', // roxo
  '#ec4899', // rosa
] as const

// Cor opcional em hex (#rrggbb). À prova de chave ausente.
const corOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? undefined : v))
  .refine(
    (v) => v === undefined || /^#[0-9a-fA-F]{6}$/.test(v),
    'Cor inválida',
  )
  .optional()

// -----------------------------------------------------------------
// Criar (admin define usuário + senha inicial)
// -----------------------------------------------------------------

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  username: usernameSchema,
  telefone: stringOpt(20),
  role: z.enum(userRoleValues),
  cor: corOpt,
  senha: z.string().min(6, 'Senha precisa de ao menos 6 caracteres'),
})

export type CriarUsuarioInput = z.input<typeof criarUsuarioSchema>

// -----------------------------------------------------------------
// Atualizar (sem senha — admin reseta separado se precisar)
// -----------------------------------------------------------------

export const atualizarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  telefone: stringOpt(20),
  role: z.enum(userRoleValues),
  cor: corOpt,
  ativo: z.boolean(),
})

export type AtualizarUsuarioInput = z.input<typeof atualizarUsuarioSchema>

// -----------------------------------------------------------------
// Reset de senha (admin)
// -----------------------------------------------------------------

export const resetSenhaSchema = z.object({
  novaSenha: z.string().min(6, 'Senha precisa de ao menos 6 caracteres'),
})

export type ResetSenhaInput = z.input<typeof resetSenhaSchema>

// -----------------------------------------------------------------
// Labels
// -----------------------------------------------------------------

export const ROLE_LABEL: Record<(typeof userRoleValues)[number], string> = {
  admin: 'Administrador',
  gerente_producao: 'Gerente de produção',
  operador: 'Operador',
  estoquista: 'Estoquista',
  vendas: 'Vendas',
}
