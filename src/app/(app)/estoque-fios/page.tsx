import type { Metadata } from 'next'

import { listarCoresAtivas } from '../cores/actions'
import { listarCoresFornecedor, listarLotesFio } from './actions'
import { EstoqueFiosTabs } from './estoque-fios-tabs'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
import { agruparSaldoPorCor } from '@/lib/fios/saldo'

export const metadata: Metadata = { title: 'Estoque de fios — Vanvest' }

export default async function EstoqueFiosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('estoqueFios')
  const nivel = await nivelDaAreaPara(user.role, 'estoqueFios')
  const podeEditar = podeEscrever(nivel)

  const [lotes, coresFornecedor, coresAtivas] = await Promise.all([
    listarLotesFio(),
    listarCoresFornecedor(),
    listarCoresAtivas(),
  ])

  const sp = await searchParams
  const tabInicial = typeof sp.tab === 'string' ? sp.tab : 'entradas'

  // Agrupado AQUI, no server component, a partir da mesma lista que a aba de
  // entradas já usa — o saldo por cor não custa consulta nenhuma a mais.
  const saldo = agruparSaldoPorCor(lotes)

  return (
    <EstoqueFiosTabs
      tabInicial={tabInicial}
      saldo={saldo}
      lotes={lotes}
      coresFornecedor={coresFornecedor}
      coresAtivas={coresAtivas}
      podeEditar={podeEditar}
    />
  )
}
