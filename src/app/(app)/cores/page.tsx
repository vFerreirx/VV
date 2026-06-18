import type { Metadata } from 'next'

import { listarCores } from './actions'
import { CoresList } from './cores-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Cores — Vanvest' }

export default async function CoresPage() {
  const user = await requireArea('cores')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'cores'))
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
