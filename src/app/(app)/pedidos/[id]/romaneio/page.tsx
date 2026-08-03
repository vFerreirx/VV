import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

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

  const orcamento = await obterOrcamentoParaRomaneio(id)
  if (!orcamento) notFound()

  return <RomaneioDoc orcamento={orcamento} />
}
