import 'server-only'

// Cliente Supabase pra Server Components, Server Actions e Route Handlers.
// Lê e escreve cookies via next/headers — NO Next 16 cookies() é async.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // setAll lança quando chamado de Server Components puros
            // (sem POST/Server Action). O proxy.ts cuida de refresh nesse caso.
          }
        },
      },
    },
  )
}
