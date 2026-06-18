// Layout autenticado — guarda de sessão + chrome do app (sidebar + topbar).
// Todos os filhos rodam como Server Components por padrão.

import { Suspense } from 'react'

import { PageTransition } from '@/components/layout/page-transition'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { TopbarFallback } from '@/components/layout/topbar-fallback'
import { areasBloqueadas } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  const bloqueadas = await areasBloqueadas(user.role)

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar bloqueadas={bloqueadas} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopbarFallback user={user} bloqueadas={bloqueadas} />}>
          <Topbar user={user} bloqueadas={bloqueadas} />
        </Suspense>
        <main className="flex-1 overflow-y-auto pt-4 pb-[max(1rem,var(--sa-bottom,env(safe-area-inset-bottom)))] pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))] pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))] md:pt-6 md:pb-[max(1.5rem,var(--sa-bottom,env(safe-area-inset-bottom)))] md:pl-[max(1.5rem,var(--sa-left,env(safe-area-inset-left)))] md:pr-[max(1.5rem,var(--sa-right,env(safe-area-inset-right)))]">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  )
}
