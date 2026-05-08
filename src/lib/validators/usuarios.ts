import { z } from 'zod'

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

// -----------------------------------------------------------------
// Criar (admin define email + senha inicial)
// -----------------------------------------------------------------

export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email inválido')
    .max(120, 'Email muito longo'),
  telefone: stringOpt(20),
  role: z.enum(userRoleValues),
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
