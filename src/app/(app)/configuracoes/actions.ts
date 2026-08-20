'use server'

import { revalidatePath } from 'next/cache'

import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import {
  alterarSenhaSchema,
  atualizarPerfilSchema,
  type AlterarSenhaInput,
  type AtualizarPerfilInput,
} from '@/lib/validators/auth'
import { eq } from 'drizzle-orm'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export async function atualizarPerfilAction(input: AtualizarPerfilInput): Promise<ActionResult> {
  const parsed = atualizarPerfilSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Dados inválidos' }
  }

  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Não autenticado' }

  await db
    .update(users)
    .set({
      nome: parsed.data.nome,
      telefone: parsed.data.telefone ?? null,
    })
    .where(eq(users.id, user.id))

  revalidatePath('/configuracoes')
  return { success: true, message: 'Perfil atualizado' }
}

export async function alterarSenhaAction(input: AlterarSenhaInput): Promise<ActionResult> {
  const parsed = alterarSenhaSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Dados inválidos' }
  }

  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Não autenticado' }

  const supabase = await createClient()

  // Reautentica primeiro pra garantir que a senha atual está correta.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.authEmail,
    password: parsed.data.senhaAtual,
  })
  if (signInError) {
    return { success: false, error: 'Senha atual incorreta' }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.novaSenha,
  })
  if (error) {
    return { success: false, error: 'Não foi possível alterar a senha' }
  }

  return { success: true, message: 'Senha alterada' }
}
