import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../../empresas/actions'
import {
  listarOpsDoPedido,
  obterCatalogoDeSeparacao,
  obterOrcamento,
} from '../../actions'
import { listarFaltantes } from '../../faltantes-actions'
import { listarProdutosParaOrdem } from '../../../ordens/actions'
import { FaltantesDoc } from './faltantes-doc'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Itens faltantes — Vanvest' }

export default async function FaltantesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireArea('pedidos')
  const { id } = await params
  // Produzir é criar OP: escrita em ORDENS, venha de onde vier.
  const podeProduzir = podeEscrever(await nivelDaAreaPara(user.role, 'ordens'))

  // Mesma montagem da via de separação: as linhas saem de lá e só o filtro é
  // daqui. O catálogo é o que permite explodir o kit e agrupar por modelo.
  const [orcamento, empresa, catalogo, faltantes, ops, produtos] = await Promise.all([
    obterOrcamento(id),
    obterEmpresaPrincipal(),
    obterCatalogoDeSeparacao(),
    listarFaltantes(id),
    listarOpsDoPedido(id),
    // O catálogo ATIVO: é nele que a chave do faltante vira variação.
    podeProduzir
      ? listarProdutosParaOrdem({ somenteAtivas: true })
      : Promise.resolve([]),
  ])
  if (!orcamento) notFound()

  return (
    <FaltantesDoc
      orcamento={orcamento}
      empresa={empresa}
      catalogo={catalogo}
      faltantes={faltantes}
      producao={{ ops, produtos, podeProduzir }}
    />
  )
}
