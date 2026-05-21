import { z } from 'zod'

// Padrão de username válido — letras, números, ponto, hífen, underscore.
// Sem espaço e sem @ pra não confundir com email.
const usernameRegex = /^[a-zA-Z0-9._-]+$/

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Usuário muito curto (mínimo 2 caracteres)')
  .max(40, 'Usuário muito longo (máximo 40 caracteres)')
  .regex(usernameRegex, 'Use apenas letras, números, ponto, hífen ou underscore')

export const loginSchema = z.object({
  usuario: usernameSchema,
  senha: z.string().min(1, 'Informe a senha'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const atualizarPerfilSchema = z.object({
  nome: z.string().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  telefone: z
    .string()
    .max(20, 'Telefone muito longo')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export type AtualizarPerfilInput = z.infer<typeof atualizarPerfilSchema>

export const alterarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual'),
    novaSenha: z.string().min(6, 'Nova senha precisa de ao menos 6 caracteres'),
    confirmacao: z.string().min(1, 'Confirme a nova senha'),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    message: 'As senhas não coincidem',
    path: ['confirmacao'],
  })

export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>

// -----------------------------------------------------------------
// Helpers de username
// -----------------------------------------------------------------

export const INTERNAL_EMAIL_DOMAIN = 'malharia.app'

// Constrói o email interno usado pelo Supabase Auth a partir do username.
export function usernameToInternalEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`
}
