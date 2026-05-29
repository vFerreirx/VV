// Layout autenticado — guarda de sessão + chrome do app (sidebar + topbar).
// Todos os filhos rodam como Server Components por padrão.

import { Suspense } from 'react'

import { PageTransition } from '@/components/layout/page-transition'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { TopbarFallback } from '@/components/layout/topbar-fallback'
import { requireAuth } from '@/lib/auth/require-auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopbarFallback user={user} />}>
          <Topbar user={user} />
        </Suspense>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  )
}
