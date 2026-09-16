import type { Metadata } from 'next'

import { listarFilaDeReposicao, listarReposicoesAtendidas } from './actions'
import { ReposicaoView } from './reposicao-view'
import { listarProdutosParaOrdem } from '../ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Reposição de estoque — Vanvest' }

// ⚠️ ESTA TELA NÃO MOSTRA SALDO. Nada no sistema registra saída, então o
// saldo só crescia e mostrava mais peça do que existe. O /estoque virou a
// FILA DE REPOSIÇÃO: a lista de peças que alguém avisou que estão acabando, e
// que termina em OP. O porquê completo está em src/lib/db/saldo-estoque.ts.
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('estoque')
  const [nivelEstoque, nivelOrdens] = await Promise.all([
    nivelDaAreaPara(user.role, 'estoque'),
    nivelDaAreaPara(user.role, 'ordens'),
  ])
  // Marcar é de quem cuida do estoque; produzir e descartar, de quem decide
  // o que se produz.
  const podeMarcar = podeEscrever(nivelEstoque)
  const podeProduzir = podeEscrever(nivelOrdens)

  const [fila, atendidos, produtos] = await Promise.all([
    listarFilaDeReposicao(),
    listarReposicoesAtendidas(),
    podeMarcar || podeProduzir
      ? listarProdutosParaOrdem({ somenteAtivas: true })
      : Promise.resolve([]),
  ])

  const sp = await searchParams
  const abaInicial = sp.aba === 'atendidos' ? 'atendidos' : 'fila'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reposição de estoque</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Peças que alguém avisou que estão acabando. Cada uma vira uma OP de
          canal Estoque, e sai da fila quando essa OP recebe baixa.
        </p>
      </div>
      <ReposicaoView
        fila={fila}
        atendidos={atendidos}
        produtos={produtos}
        podeMarcar={podeMarcar}
        podeProduzir={podeProduzir}
        abaInicial={abaInicial}
      />
    </div>
  )
}
