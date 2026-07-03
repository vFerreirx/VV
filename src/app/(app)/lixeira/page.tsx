import type { Metadata } from 'next'

import { listarExcluidos } from './actions'
import { LixeiraList } from './lixeira-list'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Lixeira — Vanvest' }

export default async function LixeiraPage() {
  await requireArea('lixeira')
  const itens = await listarExcluidos()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lixeira</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Itens excluídos ficam guardados aqui e podem ser restaurados.
        </p>
      </div>

      <LixeiraList itens={itens} />
    </div>
  )
}
