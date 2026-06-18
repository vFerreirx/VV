import type { Metadata } from 'next'

import {
  listarEstacoes,
  listarMaquinasOpcoes,
  listarOperadores,
} from './actions'
import { EstacoesList } from './estacoes-list'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Estações — Vanvest' }

export default async function EstacoesPage() {
  await requireArea('estacoes')

  const [estacoes, operadores, maquinas] = await Promise.all([
    listarEstacoes(),
    listarOperadores(),
    listarMaquinasOpcoes(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estações</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Grupos de máquinas com operador de dia e de noite. A cor da estação
          colore os cards do kanban.
        </p>
      </div>
      <EstacoesList
        estacoes={estacoes}
        operadores={operadores}
        maquinas={maquinas}
      />
    </div>
  )
}
