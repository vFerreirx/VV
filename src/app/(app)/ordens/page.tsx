import type { Metadata } from 'next'
import Link from 'next/link'

import { listarOrdens } from './actions'
import { OrdensList } from './ordens-list'
import { Button } from '@/components/ui/button'
import { isManager, requireAuth } from '@/lib/auth/require-auth'
import {
  ordensFiltrosSchema,
  type OrdensFiltros,
} from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Ordens — Vanvest' }

export default async function OrdensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireAuth()
  const podeEditar = isManager(user.role)

  const params = await searchParams
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    raw[k] = Array.isArray(v) ? v[0] : v
  }
  const parsed = ordensFiltrosSchema.safeParse(raw)
  const filtros: OrdensFiltros = parsed.success ? parsed.data : {}

  const ordens = await listarOrdens(filtros)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ordens de produção</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {ordens.length} OP{ordens.length === 1 ? '' : 's'}
          </p>
        </div>
        {podeEditar && (
          <Button render={<Link href="/ordens/novo" />}>Nova OP</Button>
        )}
      </div>

      <OrdensList
        ordens={ordens}
        podeEditar={podeEditar}
        filtrosIniciais={filtros}
      />
    </div>
  )
}
