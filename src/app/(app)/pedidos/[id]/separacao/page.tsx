import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterOrcamento } from '../../actions'
import { SeparacaoDoc } from './separacao-doc'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Via de separação — Vanvest' }

export default async function SeparacaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireArea('vendas')
  const { id } = await params

  const orcamento = await obterOrcamento(id)
  if (!orcamento) notFound()

  return <SeparacaoDoc orcamento={orcamento} />
}
