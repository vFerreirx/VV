import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'
import { cache } from 'react'

import { db } from '@/lib/db'
import { users, type User } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'

export type AuthUser = User & {
  authEmail: string
}

// Cacheado por request (React cache) — pode ser chamado em múltiplos
// componentes do mesmo render sem reconsultar o banco.
//
// Bloqueia usuários soft-deleted ou com ativo=false: getCurrentUser retorna
// null e o requireAuth derruba a sessão pra /login.
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const [profile] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, authUser.id),
        isNull(users.deletedAt),
        eq(users.ativo, true),
      ),
    )
    .limit(1)

  if (!profile) return null

  return { ...profile, authEmail: authUser.email ?? profile.email }
})
