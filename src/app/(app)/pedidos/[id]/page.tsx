import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../empresas/actions'
import { obterCatalogoDePesos, obterOrcamento } from '../actions'
import { OrcamentoDoc } from './orcamento-doc'
import { requireArea } from '@/lib/auth/require-auth'
import { calcularPesos } from '@/lib/peso'

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
  const [orcamento, empresa, catalogo] = await Promise.all([
    obterOrcamento(id),
    obterEmpresaPrincipal(),
    obterCatalogoDePesos(),
  ])
  if (!orcamento) notFound()

  // O peso é calculado AQUI, a cada leitura, a partir do catálogo de agora —
  // não é snapshot como o preço. Ver o comentário em src/lib/peso.ts.
  const pesos = calcularPesos(orcamento.itens, catalogo)

  return (
    <OrcamentoDoc orcamento={orcamento} empresa={empresa} pesos={pesos} />
  )
}
