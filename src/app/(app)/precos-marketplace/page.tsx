import type { Metadata } from 'next'

import { listarPrecosMarketplace } from './actions'
import { PrecosMarketplaceView } from './precos-marketplace-view'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Preços de marketplace — Vanvest' }

export default async function PrecosMarketplacePage() {
  const user = await requireArea('precosMarketplace')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'precosMarketplace'))

  const linhas = await listarPrecosMarketplace()

  return <PrecosMarketplaceView linhas={linhas} podeEditar={podeEditar} />
}
