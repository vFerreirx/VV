import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { obterEmpresaPrincipal } from '../../../empresas/actions'
import { obterCatalogoDeSeparacao, obterOrcamento } from '../../actions'
import { listarFaltantes } from '../../faltantes-actions'
import { SeparacaoDoc } from './separacao-doc'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Via de separação — Vanvest' }

export default async function SeparacaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireArea('vendas')
  const { id } = await params

  // A empresa e o catálogo são carregados AQUI, no server component — o
  // componente de impressão só recebe o que já veio resolvido. O catálogo é
  // o que permite agrupar por modelo/tipo (src/lib/separacao.ts).
  const [orcamento, empresa, catalogo, faltantes] = await Promise.all([
    obterOrcamento(id),
    obterEmpresaPrincipal(),
    obterCatalogoDeSeparacao(),
    listarFaltantes(id),
  ])
  if (!orcamento) notFound()

  // Marcar faltante é ESCRITA na área de vendas, igual ao resto do pedido:
  // quem só tem "ver" enxerga a via e não os campos.
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))

  return (
    <SeparacaoDoc
      orcamento={orcamento}
      empresa={empresa}
      catalogo={catalogo}
      faltantesSalvos={faltantes}
      podeEditar={podeEditar}
    />
  )
}
