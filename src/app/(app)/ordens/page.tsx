import type { Metadata } from 'next'
import Link from 'next/link'

import { listarOrdens, listarProdutosParaOrdem } from './actions'
import { GerarDeKit } from './gerar-de-kit'
import { OrdensList } from './ordens-list'
import { listarKitsComItens } from '../kits/actions'
import { Button } from '@/components/ui/button'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { isManager, requireArea } from '@/lib/auth/require-auth'
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
  const user = await requireArea('ordens')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'ordens'))
  // Gerar OPs a partir de um kit é ação de produção (admin/gerente).
  const podeGerarKit = isManager(user.role)

  const params = await searchParams
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    raw[k] = Array.isArray(v) ? v[0] : v
  }
  const parsed = ordensFiltrosSchema.safeParse(raw)
  const filtros: OrdensFiltros = parsed.success ? parsed.data : {}

  const [ordens, kits, produtosParaKit] = await Promise.all([
    listarOrdens(filtros),
    podeGerarKit ? listarKitsComItens() : Promise.resolve([]),
    podeGerarKit ? listarProdutosParaOrdem() : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ordens de produção</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {ordens.length} OP{ordens.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeGerarKit && kits.length > 0 && (
            <GerarDeKit kits={kits} produtos={produtosParaKit} />
          )}
          {podeEditar && (
            <Button render={<Link href="/ordens/novo" />}>Nova OP</Button>
          )}
        </div>
      </div>

      <OrdensList
        ordens={ordens}
        podeEditar={podeEditar}
        filtrosIniciais={filtros}
      />
    </div>
  )
}
