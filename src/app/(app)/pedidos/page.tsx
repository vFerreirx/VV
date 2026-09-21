import { ViewTransition } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import {
  listarOrcamentos,
  listarPrecosRecentes,
  obterCatalogoDePrecos,
} from './actions'
import { PedidosTabs } from './pedidos-tabs'
import {
  listarCompradores,
  listarCompradoresParaSelecao,
} from '../clientes/actions'
import { listarKitsComItens } from '../kits/actions'
import { listarProdutosParaOrdem } from '../ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { destinoInicial, nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Pedidos — Vanvest' }

// PEDIDOS E CLIENTES NUMA TELA SÓ, em abas — o mesmo arranjo da /fabrica.
// Cada aba segue a PRÓPRIA área: Pedidos é `pedidos`, Clientes é
// `compradores`. Quem não tem nenhuma das duas vai pra casa dele.
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireAuth()
  const [nivelPedidos, nivelCompradores] = await Promise.all([
    nivelDaAreaPara(user.role, 'pedidos'),
    nivelDaAreaPara(user.role, 'compradores'),
  ])
  const verPedidos = nivelPedidos !== 'nenhum'
  const verClientes = nivelCompradores !== 'nenhum'
  if (!verPedidos && !verClientes) redirect(await destinoInicial(user.role))

  const [pedidos, clientes] = await Promise.all([
    verPedidos
      ? Promise.all([
          listarOrcamentos(),
          // O builder do pedido ESCOLHE peça e tamanho.
          listarProdutosParaOrdem({ somenteAtivas: true }),
          listarKitsComItens(),
          listarPrecosRecentes(),
          obterCatalogoDePrecos(),
          // Só nome e id, e só pra quem tem a área de clientes — quem tem
          // pedidos sem clientes não recebe dado pessoal nenhum, e o diálogo
          // oferece só "Cliente avulso".
          verClientes ? listarCompradoresParaSelecao() : Promise.resolve([]),
        ])
      : null,
    // Os dados pessoais (documento, telefone, endereço) só com a área.
    verClientes ? listarCompradores() : null,
  ])

  const sp = await searchParams
  const tabInicial = sp.tab === 'clientes' ? 'clientes' : 'pedidos'
  const clienteInicial = typeof sp.cliente === 'string' ? sp.cliente : null

  // Entrada do reveal de Suspense: par do exit no loading.tsx desta rota.
  // `default="none"` impede este ViewTransition de animar junto em qualquer
  // outra transicao da pagina.
  return (
    <ViewTransition enter="vt-entra-sobe" default="none">
      <PedidosTabs
        tabInicial={tabInicial}
        pedidos={
          pedidos
            ? {
                orcamentos: pedidos[0],
                produtos: pedidos[1],
                kits: pedidos[2],
                precos: pedidos[3],
                tabela: pedidos[4],
                compradores: pedidos[5],
                podeEditar: podeEscrever(nivelPedidos),
              }
            : null
        }
        clientes={
          clientes
            ? {
                compradores: clientes,
                podeEditar: podeEscrever(nivelCompradores),
                clienteInicial,
              }
            : null
        }
      />
    </ViewTransition>
  )
}
