import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../../empresas/actions'
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

  // A empresa é carregada AQUI, no server component — o componente de
  // impressão só recebe o que já veio resolvido.
  const [orcamento, empresa] = await Promise.all([
    obterOrcamento(id),
    obterEmpresaPrincipal(),
  ])
  if (!orcamento) notFound()

  return <SeparacaoDoc orcamento={orcamento} empresa={empresa} />
}
