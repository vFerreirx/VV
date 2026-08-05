import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../../empresas/actions'
import { obterOrcamentoParaRomaneio } from '../../actions'
import { RomaneioDoc } from './romaneio-doc'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Romaneio — Vanvest' }

export default async function RomaneioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireArea('vendas')
  const { id } = await params

  // A empresa é carregada AQUI, no server component — o componente de
  // impressão só recebe o que já veio resolvido.
  const [orcamento, empresa] = await Promise.all([
    obterOrcamentoParaRomaneio(id),
    obterEmpresaPrincipal(),
  ])
  if (!orcamento) notFound()

  return <RomaneioDoc orcamento={orcamento} empresa={empresa} />
}
