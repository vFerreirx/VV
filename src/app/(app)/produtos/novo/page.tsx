import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { listarCores } from '@/app/(app)/cores/actions'
import { listarModelos } from '@/app/(app)/modelos/actions'
import { listarTamanhos } from '@/app/(app)/tamanhos/actions'
import { ProdutoForm } from '@/components/forms/produto-form'
import { Button } from '@/components/ui/button'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Novo produto — Vanvest' }

export default async function NovoProdutoPage() {
  const user = await requireRole(['admin', 'gerente_producao'])
  // Ver o comentário na tela de edição: cadastrar produto e definir preço são
  // permissões diferentes.
  const podeEditarPreco = podeEscrever(
    await nivelDaAreaPara(user.role, 'precosCatalogo'),
  )
  const [cores, modelos, tamanhos] = await Promise.all([
    listarCores(),
    listarModelos(),
    listarTamanhos(),
  ])

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
            Cadastre um produto e suas variações.
          </p>
        </div>
      </div>

      <ProdutoForm
        cores={cores}
        modelos={modelos}
        tamanhos={tamanhos}
        podeEditarPreco={podeEditarPreco}
      />
    </div>
  )
}
