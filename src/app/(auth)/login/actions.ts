'use server'

import { redirect } from 'next/navigation'

import {
  loginSchema,
  usernameToInternalEmail,
  type LoginInput,
} from '@/lib/validators/auth'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { success: true } | { success: false; error: string }

export async function loginAction(
  input: LoginInput,
  next?: string,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Usuário ou senha inválidos' }
  }

  const supabase = await createClient()

  // O Supabase Auth usa email internamente — montamos a partir do username
  // que o usuário digitou. Isso é detalhe de implementação, o usuário só
  // conhece o "usuário".
  const internalEmail = usernameToInternalEmail(parsed.data.usuario)

  const { error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password: parsed.data.senha,
  })

  if (error) {
    return { success: false, error: 'Usuário ou senha incorretos' }
  }

  redirect(next && next.startsWith('/') ? next : '/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
