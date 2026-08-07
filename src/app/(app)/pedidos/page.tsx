import { ViewTransition } from 'react'
import type { Metadata } from 'next'

import {
  listarClientesOrcamentos,
  listarOrcamentos,
  listarPrecosRecentes,
  obterCatalogoDePrecos,
} from './actions'
import { OrcamentosView } from './orcamentos-view'
import { listarCompradoresParaSelecao } from '../compradores/actions'
import { listarKitsComItens } from '../kits/actions'
import { listarProdutosParaOrdem } from '../ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Pedidos — Vanvest' }

export default async function OrcamentosPage() {
  const user = await requireArea('vendas')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))

  // A lista de compradores só é carregada pra quem tem acesso à área — quem
  // tem `vendas` mas não tem `compradores` não recebe dado pessoal nenhum.
  const nivelCompradores = await nivelDaAreaPara(user.role, 'compradores')

  const [
    orcamentos,
    produtos,
    kits,
    precos,
    tabela,
    clientes,
    compradores,
  ] = await Promise.all([
      listarOrcamentos(),
      listarProdutosParaOrdem(),
      listarKitsComItens(),
      listarPrecosRecentes(),
      obterCatalogoDePrecos(),
      listarClientesOrcamentos(),
      nivelCompradores !== 'nenhum'
        ? listarCompradoresParaSelecao()
        : Promise.resolve([]),
    ])

  // Entrada do reveal de Suspense: par do exit no loading.tsx desta rota.
  // `default="none"` impede este ViewTransition de animar junto em qualquer
  // outra transicao da pagina.
  return (
    <ViewTransition enter="vt-entra-sobe" default="none">
      <OrcamentosView
        orcamentos={orcamentos}
        produtos={produtos}
        kits={kits}
        precos={precos}
        tabela={tabela}
        clientes={clientes}
        compradores={compradores}
        podeEditar={podeEditar}
      />
    </ViewTransition>
  )
}
