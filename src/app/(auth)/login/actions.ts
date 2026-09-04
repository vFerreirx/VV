'use server'

import { redirect } from 'next/navigation'

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import {
  loginSchema,
  usernameToInternalEmail,
  type LoginInput,
} from '@/lib/validators/auth'
import { createClient } from '@/lib/supabase/server'
import { rotaInicial } from '@/lib/auth/rota-inicial'

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

  const { data, error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password: parsed.data.senha,
  })

  if (error) {
    return { success: false, error: 'Usuário ou senha incorretos' }
  }

  if (next && next.startsWith('/')) redirect(next)

  // Sem destino pedido, cada cargo cai na SUA casa — ver rotaInicial.
  //
  // O cargo sai da tabela pelo id que o próprio login acabou de devolver, e
  // não de `getCurrentUser()`: aquele monta OUTRO cliente Supabase e releria
  // o cookie de sessão que esta mesma requisição acabou de escrever. Funciona,
  // mas depende de uma ordem que não está escrita em lugar nenhum — e falharia
  // em silêncio, mandando o operador pro dashboard sem erro nenhum. O id já
  // está na mão; ler direto não tem como dar meio-certo.
  const [perfil] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, data.user.id))
    .limit(1)

  redirect(rotaInicial(perfil?.role))
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
