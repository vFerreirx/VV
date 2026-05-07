import 'server-only'

import { redirect } from 'next/navigation'

import { getCurrentUser, type AuthUser } from './get-user'
import type { User } from '@/lib/db/schema'

// Garante usuário autenticado. Usado em layouts/páginas server.
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) {
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
