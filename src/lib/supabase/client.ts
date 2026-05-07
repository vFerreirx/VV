// Cliente Supabase pra Client Components (browser).
// Usa cookies do navegador via @supabase/ssr — a sessão é compartilhada
// com os Server Components/Actions através do cookie httpOnly.

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
