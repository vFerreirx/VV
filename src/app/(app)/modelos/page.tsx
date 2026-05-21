import type { Metadata } from 'next'

import { listarModelos } from './actions'
import { ModelosList } from './modelos-list'
import { isManager, requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Modelos — Malharia MVP' }

export default async function ModelosPage() {
  const user = await requireAuth()
  const podeEditar = isManager(user.role)
  const modelos = await listarModelos()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Modelos</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Catálogo de desenhos/estampas usado nas variações de produto
        </p>
      </div>

      <ModelosList modelos={modelos} podeEditar={podeEditar} />
    </div>
  )
}
