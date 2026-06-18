import type { Metadata } from 'next'

import { listarModelos } from './actions'
import { ModelosList } from './modelos-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Modelos — Vanvest' }

export default async function ModelosPage() {
  const user = await requireArea('modelos')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'modelos'))
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
