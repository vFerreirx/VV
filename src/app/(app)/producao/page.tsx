import type { Metadata } from 'next'

import {
  listarOrdensProducao,
  type KanbanFiltros,
} from './actions'
import { KanbanBoard } from './kanban-board'
import { ProducaoFiltros } from './producao-filtros'
import {
  listarMaquinasParaOrdem,
  listarProdutosParaOrdem,
  listarResponsaveis,
} from '@/app/(app)/ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
import { canalValues } from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Produção — Vanvest' }

export default async function ProducaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('kanban')

  const params = await searchParams
  const flat: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(params)) {
    flat[k] = Array.isArray(v) ? v[0] : v
  }

  // Validação leve dos filtros (a server action revalida).
  const canal = (canalValues as readonly string[]).includes(flat.canal ?? '')
    ? (flat.canal as KanbanFiltros['canal'])
    : 'todos'
  const filtros: KanbanFiltros = {
    q: flat.q,
    canal,
    maquinaId: flat.maquinaId ?? 'todas',
    responsavelId: flat.responsavelId ?? 'todos',
  }

  const [ordens, maquinas, responsaveis, produtos] = await Promise.all([
    listarOrdensProducao(filtros),
    listarMaquinasParaOrdem(),
    listarResponsaveis(),
    listarProdutosParaOrdem(),
  ])

  // Nível do kanban (editável em /permissoes). "Controle total" move; "só
  // ver" é leitura. O operador continua limitado à OP dele (na ação).
  const podeMover = podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))
  const podeCriar = podeMover // mesmos papéis criam OP rápida

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Produção (Kanban)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {ordens.length} OP{ordens.length === 1 ? '' : 's'} ativas · arraste
          os cards entre as colunas pra mover de status
        </p>
      </div>

      <ProducaoFiltros
        maquinas={maquinas}
        responsaveis={responsaveis}
        filtrosIniciais={filtros}
      />

      <KanbanBoard
        ordens={ordens}
        podeMover={podeMover}
        currentUserId={user.id}
        produtos={produtos}
        podeCriar={podeCriar}
      />
    </div>
  )
}
