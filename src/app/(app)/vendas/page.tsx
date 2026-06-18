import type { Metadata } from 'next'

import { listarVendasRecentes, obterVendaDoDia } from './actions'
import { VendasView } from './vendas-view'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Vendas — Vanvest' }

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole(['admin', 'gerente_producao', 'vendas'])

  const sp = await searchParams
  const dataParam = typeof sp.data === 'string' ? sp.data : undefined
  const data =
    dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam) ? dataParam : hojeISO()

  const [vendaDoDia, recentes] = await Promise.all([
    obterVendaDoDia(data),
    listarVendasRecentes(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vendas diárias</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Unidades vendidas e faturamento de cada dia.
        </p>
      </div>
      <VendasView data={data} vendaDoDia={vendaDoDia} recentes={recentes} />
    </div>
  )
}
