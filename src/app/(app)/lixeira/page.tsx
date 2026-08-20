import type { Metadata } from 'next'

import { contarExcluidos, listarExcluidos } from './actions'
import { LixeiraList } from './lixeira-list'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Lixeira — Vanvest' }

export default async function LixeiraPage() {
  await requireArea('lixeira')
  const [itens, total] = await Promise.all([listarExcluidos(), contarExcluidos()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lixeira</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Itens excluídos ficam guardados aqui e podem ser restaurados — ou apagados de vez, sem
          volta.
        </p>
      </div>

      <LixeiraList itens={itens} total={total} />
    </div>
  )
}
