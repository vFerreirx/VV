import type { Metadata } from 'next'

import { listarContas } from './actions'
import { ContasList } from './contas-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Contas de marketplace — Vanvest' }

export default async function ContasMarketplacePage() {
  const user = await requireArea('contasMarketplace')
  const nivel = await nivelDaAreaPara(user.role, 'contasMarketplace')
  const podeEditar = podeEscrever(nivel)

  const contas = await listarContas()

  return <ContasList contas={contas} podeEditar={podeEditar} />
}
