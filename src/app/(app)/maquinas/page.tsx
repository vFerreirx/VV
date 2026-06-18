import type { Metadata } from 'next'
import Link from 'next/link'

import { listarMaquinas } from './actions'
import { MaquinasGrid } from './maquinas-grid'
import { Button } from '@/components/ui/button'
import { isManager, requireArea } from '@/lib/auth/require-auth'
import {
  maquinasFiltrosSchema,
  type MaquinasFiltros,
} from '@/lib/validators/maquinas'

export const metadata: Metadata = { title: 'Máquinas — Vanvest' }

export default async function MaquinasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('maquinas')
  const podeEditar = isManager(user.role)

  const params = await searchParams
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    raw[k] = Array.isArray(v) ? v[0] : v
  }
  const parsed = maquinasFiltrosSchema.safeParse(raw)
  const filtros: MaquinasFiltros = parsed.success ? parsed.data : {}

  const maquinas = await listarMaquinas(filtros)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Máquinas</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {maquinas.length} máquina{maquinas.length === 1 ? '' : 's'}
          </p>
        </div>
        {podeEditar && (
          <Button render={<Link href="/maquinas/novo" />}>Nova máquina</Button>
        )}
      </div>

      <MaquinasGrid
        maquinas={maquinas}
        podeEditar={podeEditar}
        isOperador={user.role === 'operador'}
        userId={user.id}
        filtrosIniciais={filtros}
      />
    </div>
  )
}
