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

// Mínimo de senha NOVA. Vale só pra quem está definindo/trocando senha —
// aqui, no cadastro de usuário e no reset do admin (src/lib/validators/
// usuarios.ts). Se mudar, mude nos três: são a mesma política.
//
// O `loginSchema` abaixo continua em `min(1)` DE PROPÓSITO. Ele valida quem
// está entrando, não quem está definindo: subir o mínimo lá trancaria na
// porta todo mundo que já tem senha curta, sem nem tentar autenticar.
export const SENHA_MIN = 12

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
    novaSenha: z.string().min(SENHA_MIN, `Nova senha precisa de ao menos ${SENHA_MIN} caracteres`),
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
