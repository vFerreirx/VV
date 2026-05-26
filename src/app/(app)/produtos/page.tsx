import type { Metadata } from 'next'
import Link from 'next/link'

import { listarProdutos } from './actions'
import { ProdutosList } from './produtos-list'
import { Button } from '@/components/ui/button'
import { isManager } from '@/lib/auth/require-auth'
import { requireAuth } from '@/lib/auth/require-auth'
import {
  produtosFiltrosSchema,
  type ProdutosFiltros,
} from '@/lib/validators/produtos'

export const metadata: Metadata = { title: 'Produtos — Vanvest' }

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireAuth()
  const podeEditar = isManager(user.role)

  // Lê filtros do URL (sem string[] — pegamos o primeiro valor).
  const params = await searchParams
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    raw[k] = Array.isArray(v) ? v[0] : v
  }
  const parsed = produtosFiltrosSchema.safeParse(raw)
  const filtros: ProdutosFiltros = parsed.success ? parsed.data : {}

  const produtos = await listarProdutos(filtros)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Produtos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {produtos.length} produto{produtos.length === 1 ? '' : 's'} encontrado
            {produtos.length === 1 ? '' : 's'}
          </p>
        </div>
        {podeEditar && (
          <Button render={<Link href="/produtos/novo" />}>Novo produto</Button>
        )}
      </div>

      <ProdutosList
        produtos={produtos}
        podeEditar={podeEditar}
        filtrosIniciais={filtros}
      />
    </div>
  )
}
