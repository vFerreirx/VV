import type { Metadata } from 'next'

import {
  contarOpsDaEstacao,
  listarMaquinasDaEstacao,
  listarOrdensProducao,
  type KanbanFiltros,
} from './actions'
import { KanbanBoard } from './kanban-board'
import { listarMaquinas } from '../maquinas/actions'
import { PainelOperador } from './painel-operador'
import { ProducaoFiltros } from './producao-filtros'
import {
  listarMaquinasParaOrdem,
  listarProdutosParaOrdem,
  listarResponsaveis,
} from '@/app/(app)/ordens/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { contarMaquinas, situacaoDaMaquina } from '@/lib/producao/estado-maquina'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { isManager, requireArea } from '@/lib/auth/require-auth'
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
  //   - `contarOpsDaEstacao` devolve DOIS NÚMEROS, e só. É o que fica fora
  //     da área principal: a fila e as terminadas, atrás de botão com
  //     contador.
  //
  // ⚠️ E OS NÚMEROS SÃO NÚMEROS, não `.length` de uma lista carregada. Esta
  // página chegou a buscar a lista COMPLETA de OPs visíveis — 25 colunas, 7
  // joins, três subqueries correlacionadas por linha — pra usar dois totais
  // dela. A tela não crescia, os dados sim. Quem abre a fila paga por ela;
  // quem só olha a estação, não.
  //
  // A OP em produção vem pendurada na máquina, então ela nem passa por
  // aqui — o cartão da máquina já é o lugar dela.
  if (user.role === 'operador') {
    const [visao, contagens] = await Promise.all([
      listarMaquinasDaEstacao(),
      contarOpsDaEstacao(),
    ])

    return (
      <PainelOperador
        nomeOperador={user.nome}
        estacaoNome={visao.estacao?.nome ?? null}
        maquinas={visao.maquinas}
        contagens={contagens}
        podeAgir={podeMover}
        // Booleano, nunca o hash — o painel é componente de cliente.
        temPin={user.pinHash !== null}
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

  const [ordens, maquinas, responsaveis, produtos, maquinasDaFabrica] =
    await Promise.all([
      listarOrdensProducao(filtros),
      listarMaquinasParaOrdem(),
      listarResponsaveis(),
      listarProdutosParaOrdem(),
      listarMaquinas(),
    ])

  // ⚠️ A MESMA CONTA DA /fabrica: a mesma consulta (`listarMaquinas`) e a
  // mesma regra (`situacaoDaMaquina` + `contarMaquinas`). Produzindo = apta
  // com OP; aptas = produzindo + livres. A máquina em manutenção com OP dentro
  // não conta em nenhuma das duas — ela não pode produzir, e é o caso em que
  // uma conta escrita à mão aqui divergiria da outra tela.
  const contagem = contarMaquinas(
    maquinasDaFabrica.map((m) => situacaoDaMaquina(m.status, m.op !== null)),
  )
  const ocupacao = {
    produzindo: contagem.emProducao,
    aptas: contagem.emProducao + contagem.livres,
  }

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
        // Sem `isOperador`: o operador já voltou lá em cima, no painel próprio
        // dele, e o board nunca mais vê um. A prop existia só pro "Pegar pra
        // mim" do card, que saiu junto.
        currentUserId={user.id}
        ocupacao={ocupacao}
        gestor={isManager(user.role)}
        produtos={produtos}
        podeCriar={podeCriar}
      />
    </div>
  )
}
