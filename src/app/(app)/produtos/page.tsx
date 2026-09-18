import { ViewTransition } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { listarProdutos } from './actions'
import { ProdutosTabs } from './produtos-tabs'
import { listarKitsComItens } from '../kits/actions'
import { Button } from '@/components/ui/button'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
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
  const user = await requireArea('produtos')

  // DUAS PERMISSÕES DIFERENTES NA MESMA TELA: 'produtos' diz quem cadastra
  // produto, variação e peso; 'precosCatalogo' diz quem VÊ e quem EDITA o
  // preço de atacado. O catálogo é aberto de propósito (operador, estoquista
  // e vendas consultam SKU e peso); o preço, não — ele nasce só pro admin e o
  // resto se libera em /permissoes.
  const [nivelProdutos, nivelPreco] = await Promise.all([
    nivelDaAreaPara(user.role, 'produtos'),
    nivelDaAreaPara(user.role, 'precosCatalogo'),
  ])
  const podeEditar = podeEscrever(nivelProdutos)

  // Lê filtros do URL (sem string[] — pegamos o primeiro valor).
  const params = await searchParams
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    raw[k] = Array.isArray(v) ? v[0] : v
  }
  const parsed = produtosFiltrosSchema.safeParse(raw)
  const filtros: ProdutosFiltros = parsed.success ? parsed.data : {}
  const tabInicial = raw.tab === 'kits' ? 'kits' : 'produtos'

  // Os 13 kits com os componentes vêm junto: são poucos, e a aba precisa
  // deles pra mostrar o preço e o peso. O que NÃO vem é o catálogo das 471
  // variações do diálogo de kit — esse carrega quando o diálogo abre
  // (`listarProdutosParaOrdem` dentro de kits-view).
  const [produtos, kits] = await Promise.all([
    listarProdutos(filtros),
    listarKitsComItens(),
  ])

  // Entrada do reveal de Suspense: par do exit no loading.tsx desta rota.
  // `default="none"` impede este ViewTransition de animar junto em qualquer
  // outra transicao da pagina.
  return (
    <ViewTransition enter="vt-entra-sobe" default="none">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Produtos</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {produtos.length} produto{produtos.length === 1 ? '' : 's'} e{' '}
              {kits.length} kit{kits.length === 1 ? '' : 's'}.
            </p>
          </div>
          {podeEditar && (
            <Button render={<Link href="/produtos/novo" />}>Novo produto</Button>
          )}
        </div>

        <ProdutosTabs
          tabInicial={tabInicial}
          produtos={produtos}
          kits={kits}
          podeEditar={podeEditar}
          vePreco={nivelPreco !== 'nenhum'}
          podeEditarPreco={podeEscrever(nivelPreco)}
          filtrosIniciais={filtros}
        />
      </div>
    </ViewTransition>
  )
}
