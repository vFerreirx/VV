import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { listarCores } from '@/app/(app)/cores/actions'
import { ProdutoForm } from '@/components/forms/produto-form'
import { Button } from '@/components/ui/button'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Novo produto — Malharia MVP' }

export default async function NovoProdutoPage() {
  await requireRole(['admin', 'gerente_producao'])
  const cores = await listarCores()

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
        <div>
          <h1 className="text-2xl font-semibold">Novo produto</h1>
          <p className="text-muted-foreground text-sm">
            Cadastre um produto da malharia e suas variações.
          </p>
        </div>
      </div>

      <ProdutoForm cores={cores} />
    </div>
  )
}
