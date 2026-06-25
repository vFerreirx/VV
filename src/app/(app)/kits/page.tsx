import type { Metadata } from 'next'

import { listarKitsComItens } from './actions'
import { KitsView } from './kits-view'
import { listarProdutosParaOrdem } from '../ordens/actions'
import { isManager, requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Kits — Vanvest' }

export default async function KitsPage() {
  const user = await requireArea('produtos')
  const podeEditar = isManager(user.role)

  const [kits, produtos] = await Promise.all([
    listarKitsComItens(),
    listarProdutosParaOrdem(),
  ])

  return <KitsView kits={kits} produtos={produtos} podeEditar={podeEditar} />
}
