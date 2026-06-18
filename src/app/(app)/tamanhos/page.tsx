import type { Metadata } from 'next'

import { listarTamanhos } from './actions'
import { TamanhosList } from './tamanhos-list'
import { isManager, requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Tamanhos — Vanvest' }

export default async function TamanhosPage() {
  const user = await requireArea('tamanhos')
  const podeEditar = isManager(user.role)
  const tamanhos = await listarTamanhos()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tamanhos</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Catálogo de tamanhos usado nas variações (P, M, G, Casal, Queen, etc)
        </p>
      </div>

      <TamanhosList tamanhos={tamanhos} podeEditar={podeEditar} />
    </div>
  )
}
