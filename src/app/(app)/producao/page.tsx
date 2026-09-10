import type { Metadata } from 'next'

import {
  listarMaquinasDaEstacao,
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
import { destinoDaOrdem } from '@/lib/producao/destino-da-ordem'
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
  // precisa de tela de quem PRODUZ: a ESTAÇÃO como ela é fisicamente, uma
  // máquina por cartão.
  //
  // `return` antes de tudo, e não um ternário lá embaixo, pra que o caminho
  // do gerente continue exatamente o que era: os filtros, o cabeçalho e o
  // board não sabem que esta bifurcação existe.
  //
  // ⚠️ A ÁREA PRINCIPAL NÃO CRESCE COM A FILA, e é por isso que são DUAS
  // buscas com papéis diferentes:
  //
  //   - `listarMaquinasDaEstacao` desenha a tela: N máquinas, N cartões.
  //     Nove na Estação 1, sete na Estação 2 — com a fila vazia ou com cem
  //     OPs esperando.
  //   - `listarOrdensProducao` alimenta só o que fica FORA da área
  //     principal: a fila (consulta) e as terminadas (consulta), atrás de
  //     botão com contador. Ela já devolve apenas o que o operador pode ver
  //     (`condicaoDeVisaoDoOperador`).
  //
  // A OP em produção vem pendurada na máquina, então ela NÃO é particionada
  // aqui — o cartão da máquina já é o lugar dela.
  if (user.role === 'operador') {
    const [visao, ordens] = await Promise.all([
      listarMaquinasDaEstacao(),
      listarOrdensProducao(),
    ])

    // A PARTIÇÃO É EXAUSTIVA, e quem prova isso é `destinoDaOrdem` — um
    // switch sem `default` que não compila se um status novo do enum ficar
    // sem lugar na estação. O porquê está escrito lá
    // (src/lib/producao/destino-da-ordem.ts): OP que não cai em destino
    // nenhum some da tela sem erro, sem aviso e sem log.
    //
    // Aqui em cima sobra só o "está na máquina?", que a tela sabe responder
    // e a regra pura não: depende de quais máquinas são desta estação.
    const idsNasMaquinas = new Set(
      visao.maquinas.map((m) => m.op?.id).filter((id) => id !== undefined),
    )
    const destino = (o: (typeof ordens)[number]) =>
      destinoDaOrdem(o.status, idsNasMaquinas.has(o.id))

    return (
      <PainelOperador
        nomeOperador={user.nome}
        estacaoNome={visao.estacao?.nome ?? null}
        maquinas={visao.maquinas}
        fila={ordens.filter((o) => destino(o) === 'fila')}
        terminadas={ordens.filter((o) => destino(o) === 'terminadas')}
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
