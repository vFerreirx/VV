import 'server-only'

// Cliente Supabase com service role — bypassa RLS.
// Usado em Server Actions privilegiadas (ex: criar usuário pelo admin).
// NUNCA expor para Client Components.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let cachedAdmin: ReturnType<typeof createSupabaseClient> | undefined

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não definido no ambiente')
  }

  if (!cachedAdmin) {
    cachedAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )
  }

  return cachedAdmin
}
