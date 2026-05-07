import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha precisa de ao menos 6 caracteres'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const recuperarSenhaSchema = z.object({
  email: z.string().email('Email inválido'),
})

export type RecuperarSenhaInput = z.infer<typeof recuperarSenhaSchema>

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
