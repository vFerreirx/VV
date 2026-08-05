import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../empresas/actions'
import { obterOrcamento } from '../actions'
import { OrcamentoDoc } from './orcamento-doc'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Pedido — Vanvest' }

export default async function OrcamentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireArea('vendas')
  const { id } = await params

  // A empresa é carregada AQUI, no server component — o componente de
  // impressão só recebe o que já veio resolvido.
  const [orcamento, empresa] = await Promise.all([
    obterOrcamento(id),
    obterEmpresaPrincipal(),
  ])
  if (!orcamento) notFound()

  return <OrcamentoDoc orcamento={orcamento} empresa={empresa} />
}
