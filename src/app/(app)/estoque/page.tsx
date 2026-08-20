import type { Metadata } from 'next'

import { listarEstoque } from './actions'
import { EstoqueList } from './estoque-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Estoque — Vanvest' }

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('estoque')
  const podeMovimentar = podeEscrever(await nivelDaAreaPara(user.role, 'estoque'))

  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q : undefined

  const itens = await listarEstoque(q)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estoque</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Saldo de cada variação. Produção concluída pro canal &ldquo;Estoque&rdquo; entra
          automaticamente; vendas dão baixa.
        </p>
      </div>
      <EstoqueList itens={itens} podeMovimentar={podeMovimentar} buscaInicial={q ?? ''} />
    </div>
  )
}
