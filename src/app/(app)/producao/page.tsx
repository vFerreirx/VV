import type { Metadata } from 'next'

import {
  listarOrdensProducao,
  type KanbanFiltros,
} from './actions'
import { KanbanBoard } from './kanban-board'
import { PainelOperador } from './painel-operador'
import { ProducaoFiltros } from './producao-filtros'
import {
  listarMaquinasParaOrdem,
  listarProdutosParaOrdem,
  listarResponsaveis,
} from '@/app/(app)/ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
import { estacaoDoOperador } from '@/lib/db/estacao-operadores'
import { canalValues } from '@/lib/validators/ordens'

export const metadata: Metadata = { title: 'Produção — Vanvest' }

export default async function ProducaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('kanban')

  // O nível do kanban é editável em /permissoes: "controle total" age, "só
  // ver" é leitura. Vale igual nos dois caminhos abaixo — a diferença é que
  // no painel do operador ele esconde os botões, e no kanban ele trava o
  // arrastar. Quem recusa de verdade continua sendo a action.
  const podeMover = podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))

  // ─────────────────────────────────────────────────────────────────────
  // OPERADOR: TELA PRÓPRIA, E SAÍDA ANTECIPADA
  // ─────────────────────────────────────────────────────────────────────
  //
  // O kanban é tela de quem PLANEJA — quatro colunas, arrastar card,
  // filtros, pastas de remessa, contador de limite. Quem está na máquina
  // precisa de tela de quem PRODUZ: o que é meu, o que dá pra pegar, e dois
  // botões grandes.
  //
  // `return` antes de tudo, e não um ternário lá embaixo, pra que o caminho
  // do gerente continue exatamente o que era: os filtros, o cabeçalho e o
  // board não sabem que esta bifurcação existe. Cada ramo faz UMA busca —
  // o operador não tem filtro, então nem monta `KanbanFiltros`.
  //
  // `listarOrdensProducao` JÁ devolve só o que ele pode ver
  // (`condicaoDeVisaoDoOperador`: a fila sem máquina + as OPs das máquinas
  // da estação dele). Aqui é só particionar o que voltou.
  if (user.role === 'operador') {
    const [ordens, estacao] = await Promise.all([
      listarOrdensProducao(),
      estacaoDoOperador(user.id),
    ])

    return (
      <PainelOperador
        nomeOperador={user.nome}
        estacaoNome={estacao?.nome ?? null}
        minhas={ordens.filter((o) => o.responsavelId === user.id)}
        livres={ordens.filter((o) => o.responsavelId === null)}
        // O TERCEIRO GRUPO: OP das máquinas da estação dele que um COLEGA
        // pegou. Não é "minha" nem "livre", e some se a tela só tiver duas
        // listas — mas ele PODE agir nela, de propósito: o turno acaba com a
        // OP no meio e o colega precisa conseguir terminar (a regra está em
        // `operadorPodeAgirNaOrdem`, src/lib/db/estacao-operadores.ts).
        daEstacao={ordens.filter(
          (o) => o.responsavelId !== null && o.responsavelId !== user.id,
        )}
        podeAgir={podeMover}
      />
    )
  }

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
        // Sempre falso, e o type-check prova: o operador já voltou lá em
        // cima, no painel próprio dele. O board continua recebendo a prop
        // porque ele não mudou — só nunca mais vê um operador.
        isOperador={false}
        currentUserId={user.id}
        produtos={produtos}
        podeCriar={podeCriar}
      />
    </div>
  )
}
