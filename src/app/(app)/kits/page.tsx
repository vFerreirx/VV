import type { Metadata } from 'next'

import { listarKitsComItens } from './actions'
import { KitsView } from './kits-view'
import { listarProdutosParaOrdem } from '../ordens/actions'
import { requireArea } from '@/lib/auth/require-auth'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'

export const metadata: Metadata = { title: 'Kits — Vanvest' }

export default async function KitsPage() {
  const user = await requireArea('produtos')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'produtos'))

  const [kits, produtos] = await Promise.all([listarKitsComItens(), listarProdutosParaOrdem()])

  return <KitsView kits={kits} produtos={produtos} podeEditar={podeEditar} />
}
