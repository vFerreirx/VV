import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  listarMaquinasParaOrdem,
  listarProdutosParaOrdem,
  listarResponsaveis,
} from '../actions'
import { OrdemForm } from '@/components/forms/ordem-form'
import { Button } from '@/components/ui/button'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Nova OP — Malharia MVP' }

export default async function NovaOrdemPage() {
  await requireRole(['admin', 'gerente_producao'])

  const [produtos, maquinas, responsaveis] = await Promise.all([
    listarProdutosParaOrdem(),
    listarMaquinasParaOrdem(),
    listarResponsaveis(),
  ])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          render={<Link href="/ordens" />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Nova ordem de produção</h1>
          <p className="text-muted-foreground text-sm">
            O número OP-AAAA-NNNN é gerado automaticamente.
          </p>
        </div>
      </div>

      <OrdemForm
        produtos={produtos}
        maquinas={maquinas}
        responsaveis={responsaveis}
      />
    </div>
  )
}
