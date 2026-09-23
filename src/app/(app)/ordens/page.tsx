import { ViewTransition } from 'react'
import type { Metadata } from 'next'

import { listarOrdens, listarProdutosParaOrdem } from './actions'
import { NovaOpMenu } from './nova-op-menu'
import { OrdensList } from './ordens-list'
import { listarRemessasFull } from './remessas-actions'
import { listarContasAtivas } from '../contas-marketplace/actions'
import { listarKitsComItens } from '../kits/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { isManager, requireArea } from '@/lib/auth/require-auth'
import { ordensFiltrosSchema, type OrdensFiltros } from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Ordens — Vanvest' }

export default async function OrdensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('ordens')
  const [nivelOrdens, nivelKanban] = await Promise.all([
    nivelDaAreaPara(user.role, 'ordens'),
    nivelDaAreaPara(user.role, 'kanban'),
  ])
  // Criar OP (avulsa, de kit ou de Full), cancelar e excluir: escrita em ordens.
  const podeEditar = podeEscrever(nivelOrdens)
  // O painel lateral é o mesmo do kanban, e as ações de produção dele seguem
  // a escrita no KANBAN — quem só vê o board vê o painel só pra leitura.
  const podeMoverKanban = podeEscrever(nivelKanban)

  const params = await searchParams
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    raw[k] = Array.isArray(v) ? v[0] : v
  }
  const parsed = ordensFiltrosSchema.safeParse(raw)
  const filtros: OrdensFiltros = parsed.success ? parsed.data : {}

  const [pagina, kits, produtosParaKit, produtosNovaOp, remessas, contas] =
    await Promise.all([
      listarOrdens(filtros),
      podeEditar ? listarKitsComItens() : Promise.resolve([]),
      // ⚠️ ESTA LISTA TAMBÉM É DE ESCOLHA. Ela vai pro nova-op-menu e alimenta
      // "Gerar de kit" e o importar Full — os dois CRIAM OP, então não podem
      // oferecer variação que saiu do cadastro. (O comentário antigo dizia
      // "Kit e Full seguem com a lista de sempre"; desde que
      // ordens/importar-full/page.tsx passou a filtrar, as duas metades do
      // Full estavam discordando.)
      //
      // E SEM PRODUTO DE PARCEIRO: comprado pronto não vira OP
      // (src/lib/produtos/origem.ts). As actions recusam de qualquer jeito.
      podeEditar
        ? listarProdutosParaOrdem({ somenteAtivas: true, semParceiro: true })
        : Promise.resolve([]),
      // O "Nova OP" pela mesma razão: escolher é sempre entre as ativas.
      podeEditar
        ? listarProdutosParaOrdem({ somenteAtivas: true, semParceiro: true })
        : Promise.resolve([]),
      listarRemessasFull(),
      podeEditar ? listarContasAtivas() : Promise.resolve([]),
    ])

  // Entrada do reveal de Suspense: par do exit no loading.tsx desta rota.
  // `default="none"` impede este ViewTransition de animar junto em qualquer
  // outra transicao da pagina.
  return (
    <ViewTransition enter="vt-entra-sobe" default="none">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Ordens de produção</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {pagina.total} OP{pagina.total === 1 ? '' : 's'}
            </p>
          </div>
          {podeEditar && (
            <NovaOpMenu
              produtosNovaOp={produtosNovaOp}
              kits={kits}
              produtosParaKitEFull={produtosParaKit}
              remessas={remessas}
              contas={contas}
            />
          )}
        </div>

        <OrdensList
          ordens={pagina.ordens}
          total={pagina.total}
          pagina={pagina.pagina}
          totalPaginas={pagina.totalPaginas}
          remessas={remessas}
          podeEditar={podeEditar}
          filtrosIniciais={filtros}
          produtosNovaOp={produtosNovaOp}
          gestor={isManager(user.role)}
          podeMoverKanban={podeMoverKanban}
        />
      </div>
    </ViewTransition>
  )
}
