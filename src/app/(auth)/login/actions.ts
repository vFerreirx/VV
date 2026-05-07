'use server'

import { redirect } from 'next/navigation'

import { loginSchema, type LoginInput } from '@/lib/validators/auth'
import { createClient } from '@/lib/supabase/server'

export type ActionResult = { success: true } | { success: false; error: string }

export async function loginAction(
  input: LoginInput,
  next?: string,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  })

  if (error) {
    return { success: false, error: 'Email ou senha incorretos' }
  }

  redirect(next && next.startsWith('/') ? next : '/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
