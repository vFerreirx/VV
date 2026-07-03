import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterOrcamento } from '../actions'
import { OrcamentoDoc } from './orcamento-doc'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Orçamento — Vanvest' }

export default async function OrcamentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireArea('vendas')
  const { id } = await params

  const orcamento = await obterOrcamento(id)
  if (!orcamento) notFound()

  return <OrcamentoDoc orcamento={orcamento} />
}
