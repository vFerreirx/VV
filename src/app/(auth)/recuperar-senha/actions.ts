'use server'

import {
  recuperarSenhaSchema,
  type RecuperarSenhaInput,
} from '@/lib/validators/auth'
import { createClient } from '@/lib/supabase/server'

export type ActionResult =
  | { success: true; message: string }
  | { success: false; error: string }

export async function recuperarSenhaAction(
  input: RecuperarSenhaInput,
): Promise<ActionResult> {
  const parsed = recuperarSenhaSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Email inválido' }
  }

  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/configuracoes`,
  })

  // Resposta intencionalmente genérica — não revela se o email existe.
  if (error) {
    return { success: false, error: 'Não foi possível enviar o email. Tente novamente.' }
  }

  return {
    success: true,
    message: 'Se o email existir, enviamos um link de recuperação.',
  }
}
