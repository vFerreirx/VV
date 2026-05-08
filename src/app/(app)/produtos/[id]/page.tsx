import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { obterProduto } from '../actions'
import { ProdutoForm, type ProdutoFormDefaults } from '@/components/forms/produto-form'
import { Button } from '@/components/ui/button'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Editar produto — Malharia MVP' }

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(['admin', 'gerente_producao'])
  const { id } = await params

  const produto = await obterProduto(id)
  if (!produto) notFound()

  const defaults: ProdutoFormDefaults = {
    id: produto.id,
    sku: produto.sku,
    nome: produto.nome,
    descricao: produto.descricao,
    categoria: produto.categoria,
    composicao: produto.composicao,
    gramatura: produto.gramatura,
    larguraCm: produto.larguraCm,
    rendimentoKgPorMetro: produto.rendimentoKgPorMetro,
    custoProducao: produto.custoProducao,
    precoMl: produto.precoMl,
    precoShopee: produto.precoShopee,
    estoqueMinimoFullMl: produto.estoqueMinimoFullMl ?? '0',
    estoqueMinimoFullShopee: produto.estoqueMinimoFullShopee ?? '0',
    ativo: produto.ativo,
    variacoes: produto.variacoes.map((v) => ({
      id: v.id,
      skuVariacao: v.skuVariacao,
      cor: v.cor,
      tamanho: v.tamanho,
      precoAdicional: v.precoAdicional,
    })),
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          render={<Link href="/produtos" />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{produto.nome}</h1>
          <p className="text-muted-foreground font-mono text-xs">
            {produto.sku}
          </p>
        </div>
      </div>

      <ProdutoForm defaults={defaults} />
    </div>
  )
}
