import type { Metadata } from 'next'

import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Usuários — Malharia MVP' }

export default async function UsuariosPage() {
  await requireRole(['admin'])
  return (
    <div>
      <h1 className="text-2xl font-semibold">Usuários</h1>
      <p className="text-muted-foreground mt-1 text-sm">CRUD virá na Fase 9.</p>
    </div>
  )
}
