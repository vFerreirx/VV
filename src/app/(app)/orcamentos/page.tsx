import type { Metadata } from 'next'

import { listarOrcamentos } from './actions'
import { OrcamentosView } from './orcamentos-view'
import { listarProdutosParaOrdem } from '../ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Orçamentos — Vanvest' }

export default async function OrcamentosPage() {
  const user = await requireArea('vendas')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))

  const [orcamentos, produtos] = await Promise.all([
    listarOrcamentos(),
    listarProdutosParaOrdem(),
  ])

  return (
    <OrcamentosView
      orcamentos={orcamentos}
      produtos={produtos}
      podeEditar={podeEditar}
    />
  )
}
