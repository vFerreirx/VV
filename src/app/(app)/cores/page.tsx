import type { Metadata } from 'next'

import { listarCores } from './actions'
import { CoresList } from './cores-list'
import { isManager, requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Cores — Malharia MVP' }

export default async function CoresPage() {
  const user = await requireAuth()
  const podeEditar = isManager(user.role)
  const cores = await listarCores()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cores</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Catálogo de cores reutilizado nas variações de produto
          </p>
        </div>
      </div>

      <CoresList cores={cores} podeEditar={podeEditar} />
    </div>
  )
}
