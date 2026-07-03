import type { Metadata } from 'next'

import { listarOrcamentos, listarPrecosRecentes } from './actions'
import { OrcamentosView } from './orcamentos-view'
import { listarKitsComItens } from '../kits/actions'
import { listarProdutosParaOrdem } from '../ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Orçamentos — Vanvest' }

export default async function OrcamentosPage() {
  const user = await requireArea('vendas')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))

  const [orcamentos, produtos, kits, precos] = await Promise.all([
    listarOrcamentos(),
    listarProdutosParaOrdem(),
    listarKitsComItens(),
    listarPrecosRecentes(),
  ])

  return (
    <OrcamentosView
      orcamentos={orcamentos}
      produtos={produtos}
      kits={kits}
      precos={precos}
      podeEditar={podeEditar}
    />
  )
}
