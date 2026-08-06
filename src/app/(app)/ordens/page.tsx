import { ViewTransition } from 'react'
import { FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { listarOrdens, listarProdutosParaOrdem } from './actions'
import { GerarDeKit } from './gerar-de-kit'
import { NovoFull } from './novo-full'
import { OrdensList } from './ordens-list'
import { listarRemessasFull } from './remessas-actions'
import { listarContasAtivas } from '../contas-marketplace/actions'
import { listarKitsComItens } from '../kits/actions'
import { Button } from '@/components/ui/button'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
import { ordensFiltrosSchema, type OrdensFiltros } from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Ordens — Vanvest' }

export default async function OrdensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('ordens')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'ordens'))
  // Gerar OPs de kit segue a mesma escrita da área ordens.
  const podeGerarKit = podeEditar

  const params = await searchParams
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    raw[k] = Array.isArray(v) ? v[0] : v
  }
  const parsed = ordensFiltrosSchema.safeParse(raw)
  const filtros: OrdensFiltros = parsed.success ? parsed.data : {}

  const [pagina, kits, produtosParaKit, remessas, contas] = await Promise.all([
    listarOrdens(filtros),
    podeGerarKit ? listarKitsComItens() : Promise.resolve([]),
    podeEditar ? listarProdutosParaOrdem() : Promise.resolve([]),
    listarRemessasFull(),
    podeEditar ? listarContasAtivas() : Promise.resolve([]),
  ])

  // Entrada do reveal de Suspense: par do exit no loading.tsx desta rota.
  // `default="none"` impede este ViewTransition de animar junto em qualquer
  // outra transicao da pagina.
  return (
    <ViewTransition enter="vt-entra-sobe" default="none">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Ordens de produção</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {pagina.total} OP{pagina.total === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {podeEditar && (
              <Button variant="outline" render={<Link href="/ordens/importar-full" />}>
                <FileUp />
                Importar Full (PDF)
              </Button>
            )}
            {podeEditar && (
              <NovoFull
                remessas={remessas}
                produtos={produtosParaKit}
                contas={contas}
              />
            )}
            {podeGerarKit && kits.length > 0 && <GerarDeKit kits={kits} produtos={produtosParaKit} />}
            {podeEditar && <Button render={<Link href="/ordens/novo" />}>Nova OP</Button>}
          </div>
        </div>

        <OrdensList
          ordens={pagina.ordens}
          total={pagina.total}
          pagina={pagina.pagina}
          totalPaginas={pagina.totalPaginas}
          remessas={remessas}
          podeEditar={podeEditar}
          filtrosIniciais={filtros}
        />
      </div>
    </ViewTransition>
  )
}
