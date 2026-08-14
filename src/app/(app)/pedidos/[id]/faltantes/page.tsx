import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../../empresas/actions'
import { obterCatalogoDeSeparacao, obterOrcamento } from '../../actions'
import { listarFaltantes } from '../../faltantes-actions'
import { FaltantesDoc } from './faltantes-doc'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Itens faltantes — Vanvest' }

export default async function FaltantesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireArea('vendas')
  const { id } = await params

  // Mesma montagem da via de separação: as linhas saem de lá e só o filtro é
  // daqui. O catálogo é o que permite explodir o kit e agrupar por modelo.
  const [orcamento, empresa, catalogo, faltantes] = await Promise.all([
    obterOrcamento(id),
    obterEmpresaPrincipal(),
    obterCatalogoDeSeparacao(),
    listarFaltantes(id),
  ])
  if (!orcamento) notFound()

  return (
    <FaltantesDoc
      orcamento={orcamento}
      empresa={empresa}
      catalogo={catalogo}
      faltantes={faltantes}
    />
  )
}
