import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { obterProduto } from '../actions'
import { listarCores } from '@/app/(app)/cores/actions'
import { listarModelos } from '@/app/(app)/modelos/actions'
import { listarTamanhos } from '@/app/(app)/tamanhos/actions'
import { ProdutoForm, type ProdutoFormDefaults } from '@/components/forms/produto-form'
import { Button } from '@/components/ui/button'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Editar produto — Vanvest' }

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(['admin', 'gerente_producao'])
  const { id } = await params

  const [produto, cores, modelos, tamanhos] = await Promise.all([
    obterProduto(id),
    listarCores(),
    listarModelos(),
    listarTamanhos(),
  ])
  if (!produto) notFound()

  const defaults: ProdutoFormDefaults = {
    id: produto.id,
    sku: produto.sku,
    nome: produto.nome,
    descricao: produto.descricao,
    comprimentoCm: produto.comprimentoCm,
    larguraCm: produto.larguraCm,
    ativo: produto.ativo,
    variacoes: produto.variacoes.map((v) => ({
      id: v.id,
      skuVariacao: v.skuVariacao,
      cor: v.cor,
      modelo: v.modelo,
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

      <ProdutoForm
        defaults={defaults}
        cores={cores}
        modelos={modelos}
        tamanhos={tamanhos}
      />
    </div>
  )
}
