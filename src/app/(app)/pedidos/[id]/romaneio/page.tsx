import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../../empresas/actions'
import { obterCatalogoDePesos, obterOrcamentoParaRomaneio } from '../../actions'
import { RomaneioDoc } from './romaneio-doc'
import { requireArea } from '@/lib/auth/require-auth'
import { calcularPesos } from '@/lib/peso'

export const metadata: Metadata = { title: 'Romaneio — Vanvest' }

export default async function RomaneioPage({ params }: { params: Promise<{ id: string }> }) {
  await requireArea('vendas')
  const { id } = await params

  // A empresa é carregada AQUI, no server component — o componente de
  // impressão só recebe o que já veio resolvido.
  const [orcamento, empresa, catalogo] = await Promise.all([
    obterOrcamentoParaRomaneio(id),
    obterEmpresaPrincipal(),
    obterCatalogoDePesos(),
  ])
  if (!orcamento) notFound()

  // Peso recalculado na leitura, igual à tela do pedido.
  const pesos = calcularPesos(orcamento.itens, catalogo)

  return <RomaneioDoc orcamento={orcamento} empresa={empresa} pesos={pesos} />
}
