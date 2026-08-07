// Layout autenticado — guarda de sessão + chrome do app (sidebar + topbar).
// Todos os filhos rodam como Server Components por padrão.

import { cookies } from 'next/headers'
import { Suspense } from 'react'

import { Sidebar } from '@/components/layout/sidebar'
import { SIDEBAR_COOKIE } from '@/components/layout/sidebar-cookie'
import { SidebarVisibilityProvider } from '@/components/layout/sidebar-visibility'
import { Topbar } from '@/components/layout/topbar'
import { TopbarFallback } from '@/components/layout/topbar-fallback'
import { areasBloqueadas } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth()
  const bloqueadas = await areasBloqueadas(user.role)
  // Sidebar oculta lida no servidor pra o HTML já nascer com a largura
  // certa (o botão escreve esse cookie no client). A rota já era dinâmica
  // por causa do requireAuth().
  const sidebarOculta =
    (await cookies()).get(SIDEBAR_COOKIE)?.value === '1'

  return (
    <SidebarVisibilityProvider inicial={sidebarOculta}>
      <div className="flex h-screen w-full overflow-hidden print:block print:h-auto print:overflow-visible">
        <Sidebar bloqueadas={bloqueadas} />
        {/* data-app-shell / data-app-scroll: âncoras da sombra scroll-driven
            da topbar (ver globals.css). Quem rola é o <main>, e a topbar é
            irmã dele — a timeline precisa ser nomeada lá e exposta aqui, no
            ancestral comum dos dois. */}
        <div data-app-shell className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<TopbarFallback user={user} bloqueadas={bloqueadas} />}>
            <Topbar user={user} bloqueadas={bloqueadas} />
          </Suspense>
          <main data-app-scroll className="flex-1 overflow-y-auto pt-4 pb-[max(1rem,var(--sa-bottom,env(safe-area-inset-bottom)))] pl-[max(1rem,var(--sa-left,env(safe-area-inset-left)))] pr-[max(1rem,var(--sa-right,env(safe-area-inset-right)))] md:pt-6 md:pb-[max(1.5rem,var(--sa-bottom,env(safe-area-inset-bottom)))] md:pl-[max(1.5rem,var(--sa-left,env(safe-area-inset-left)))] md:pr-[max(1.5rem,var(--sa-right,env(safe-area-inset-right)))] print:overflow-visible print:p-[10mm]">
            {children}
          </main>
        </div>
      </div>
    </SidebarVisibilityProvider>
  )
}
