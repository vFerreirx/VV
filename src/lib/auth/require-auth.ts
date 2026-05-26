import 'server-only'

import { redirect } from 'next/navigation'

import { getCurrentUser, type AuthUser } from './get-user'
import type { User } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'

// Garante usuário autenticado. Usado em layouts/páginas server.
//
// Se a sessão do Supabase Auth está válida mas não existe profile em
// public.users (usuário foi soft-deleted/desativado/o banco foi resetado),
// fazemos signOut antes do redirect — caso contrário o proxy.ts vê a sessão
// válida e redireciona de volta pra área autenticada, criando loop.
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) {
    const supabase = await createClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    if (authUser) {
      await supabase.auth.signOut()
    }
    redirect('/login')
  }
  return user
}

// Garante role permitido. Redireciona pra /dashboard se não autorizado.
export async function requireRole(roles: User['role'][]): Promise<AuthUser> {
  const user = await requireAuth()
  if (!roles.includes(user.role)) {
    redirect('/dashboard')
  }
  return user
}

export const isManager = (role: User['role']) =>
  role === 'admin' || role === 'gerente_producao'
