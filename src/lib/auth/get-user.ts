import 'server-only'

import { cache } from 'react'

import { db } from '@/lib/db'
import { users, type User } from '@/lib/db/schema'
import { createClient } from '@/lib/supabase/server'
import { eq } from 'drizzle-orm'

export type AuthUser = User & {
  authEmail: string
}

// Cacheado por request (React cache) — pode ser chamado em múltiplos
// componentes do mesmo render sem reconsultar o banco.
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const [profile] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1)

  if (!profile) return null

  return { ...profile, authEmail: authUser.email ?? profile.email }
})
