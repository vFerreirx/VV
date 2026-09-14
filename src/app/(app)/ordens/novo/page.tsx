import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { listarProdutosParaOrdem } from '../actions'
import { OrdemForm } from '@/components/forms/ordem-form'
import { Button } from '@/components/ui/button'
import { requireAreaEscrita } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Nova OP — Vanvest' }

export default async function NovaOrdemPage() {
  await requireAreaEscrita('ordens')

  const produtos = await listarProdutosParaOrdem({ somenteAtivas: true })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button render={<Link href="/ordens" />} variant="ghost" size="icon-sm" aria-label="Voltar">
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Nova ordem de produção</h1>
          <p className="text-muted-foreground text-sm">
            Selecione um produto do catálogo e informe a quantidade. O número da OP é gerado
            automaticamente.
          </p>
        </div>
      </div>

      <OrdemForm produtos={produtos} />
    </div>
  )
}
