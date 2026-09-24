'use client'

import { Collapsible } from '@base-ui/react/collapsible'
import {
  ChevronDown,
  ChevronRight,
  Delete,
  RefreshCw,
  Search,
  TriangleAlert,
  WifiOff,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  contarOpsDaEstacao,
  listarOpsDaEstacao,
  listarOpsParaIniciar,
  type ContagensDaEstacao,
  type ListaDoIniciar,
  type MaquinaDaEstacao,
  type OpDaConsulta,
  type OpNaMaquina,
  type OpParaIniciar,
  type PaginaDaConsulta,
} from './actions'
import {
  concluirProducaoAction,
  desfazerConclusaoAction,
  devolverOpParaFilaAction,
  pegarOrdemAction,
} from '@/app/(app)/ordens/actions'
import { marcarEco, useRecargaAoVivo } from '@/components/realtime/use-recarga-ao-vivo'
import { ParadaDialog } from '@/components/maquinas/parada-dialog'
import { useDuracaoDesde } from '@/components/maquinas/use-duracao-desde'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  LinhaDaPeca,
  SeloDePrioridade,
  TextoDoPrazo,
} from '@/components/ordens/linha-da-peca'
import { ColorSwatch } from '@/components/ui/color-swatch'
import { Input } from '@/components/ui/input'
import { PainelAnimado, RITMO_DO_PAINEL } from '@/components/ui/painel-animado'
import { TeclaNumerica } from '@/components/ui/tecla-numerica'
import { ERRO_TABLET_TRAVADO } from '@/lib/auth/inatividade'
import {
  calcularConclusao,
  erroDeQuantidade,
} from '@/lib/producao/conclusao'
import { situacaoDaMaquina } from '@/lib/producao/estado-maquina'
import { confirmacaoAntesDeIniciar } from '@/lib/producao/inicio-da-op'
import { reacaoDaEstacao } from '@/lib/producao/recarga-da-estacao'
import {
  MOTIVOS_DE_PARADA,
  oQueParou,
  type MotivoDeParada,
} from '@/lib/producao/parada-de-maquina'
import { corDoCanal } from '@/lib/producao/cor-do-canal'
import {
  agruparPorDestino,
  alertaDoBloco,
  blocosAbertosPorPadrao,
  prazoEmPalavras,
} from '@/lib/producao/rotulo-da-op'
import {
  TravaDoTablet,
  TrocarOperadorBotao,
  useTravaDoTablet,
} from './troca-operador'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────
// A TELA DE QUEM PRODUZ — e ela é a ESTAÇÃO, não a fila.
// ─────────────────────────────────────────────────────────────────────────
//
// O kanban ao lado (kanban-board.tsx) é do gerente: quatro colunas, arrastar
// card, filtros, pastas de remessa Full, contador de limite, badge de aging.
// Aqui é o tablet preso na estação, dedo com fiapo de linha, luz de galpão.
//
// ⚠️ UM CARTÃO POR MÁQUINA, E A ÁREA PRINCIPAL NÃO CRESCE.
//
// A versão anterior listava ORDENS em três seções (minhas / livres / do
// colega), e as três cresciam junto com a fila: cem OPs esperando viravam
// cem cartões pra rolar. A estação física não muda de tamanho — são nove
// máquinas na Estação 1 e sete na Estação 2, hoje e com a fila cheia. Então
// a tela passou a ser a estação: a fila e as terminadas saíram pra trás de
// dois botões com contador, no cabeçalho.
//
// POSIÇÃO ESTÁVEL: a ordem é `codigo` da máquina, sempre (a consulta já
// devolve ordenado). O cartão da TC-01 é o primeiro esteja ela ocupada,
// livre ou em manutenção — quem trabalha aqui aprende a estação pela
// posição, e uma grade que se reordena obriga a reler tudo toda vez.
//
// SEM BARRA DE PROGRESSO. O registro passou a ser feito só no fim (Fase 3),
// então uma barra ficaria em zero o turno inteiro afirmando que nada foi
// feito. "Meta: 20 peças" diz o que ele precisa saber e não mente enquanto o
// trabalho corre.
//
// O QUE ESTA TELA NÃO TEM, e a ausência é o desenho: arrastar, colunas,
// filtros, chips, agrupamento, histórico, ícone sem rótulo, nada que dependa
// de hover. Botão é verbo — "Iniciar produção", "Concluir produção" — e
// nunca um ícone sozinho: no cartão estreito de três colunas o rótulo
// encurta, mas não vira desenho pra adivinhar.
//
// ─────────────────────────────────────────────────────────────────────────
// MEDIDAS — CALIBRADAS NO TABLET DA ESTAÇÃO, NÃO NO MONITOR
// ─────────────────────────────────────────────────────────────────────────
//
// ⚠️ A REGRA QUE DECIDE TUDO AQUI: numa tela de nove máquinas, ROLAR CUSTA
// MAIS DO QUE LER LETRA MENOR. O operador que rola perde a visão do
// conjunto, que é a única coisa que esta grade existe pra dar. Toda medida
// abaixo foi encolhida contra esse critério, e nenhuma contra o de "caber
// mais informação".
//
// Duas calibrações já aconteceram, as duas no tablet de verdade:
//
//   1ª — a versão original usava 56px de alvo e 18px de texto, e cada cartão
//        ocupava meia tela. Foi pra 48px, texto de 18px e duas colunas.
//   2ª — com duas colunas, nove máquinas davam cinco fileiras e a estação
//        ainda não cabia. Foi pra TRÊS colunas no tablet, e o cartão perdeu
//        uma linha inteira: o número da OP subiu pro topo, ao lado do código
//        da máquina, e o "com fulano" passou a só existir quando há alguém.
//
// O que ficou:
//   - grade de TRÊS colunas no tablet (`md:`), quatro no monitor do gerente.
//     Nove máquinas viram três fileiras — a estação numa tela só;
//   - o produto continua sendo o maior texto do cartão, porque é o que ele
//     reconhece de longe. Só deixou de ser `text-lg`: em três colunas o nome
//     quebra em duas linhas, e duas linhas de 18px em nove cartões eram o
//     que empurrava a terceira fileira pra fora da tela;
//   - identificação (número da OP, responsável) em `text-xs`, no topo e
//     condicional. Ninguém lê isso de longe; só serve pra conferir de perto.
//
// ⚠️ O QUE **NÃO** ENCOLHEU, e não vai encolher: o alvo de toque de 48px
// (`h-12`) nos botões do cartão, a tecla do teclado numérico (64px,
// `h-16`, em components/ui/tecla-numerica) e os botões de confirmar dos
// diálogos. TEXTO PEQUENO SE LÊ CHEGANDO PERTO; ALVO PEQUENO SE ERRA com o
// dedo sujo de fiapo — e errar ali grava número ou conclui OP. Cartão é
// leitura; diálogo é digitação.
//
// ⚠️ ISTO É SÓ UI. Nenhuma regra vive aqui: quem decide o que o operador
// pode é `operadorPodeAgirNaOrdem` / `condicaoDeVisaoDoOperador`
// (src/lib/db/estacao-operadores.ts) e as guardas das actions. A tela só
// evita oferecer o clique que já seria recusado, e mostra a mensagem que a
// action devolveu quando erra.

// OS MOTIVOS QUE O OPERADOR VÊ — cinco dos sete. "Manutenção preventiva" e
// "sem operador" são decisões do gerente, e continuam só na /fabrica.
//
// ⚠️ É FILTRO DE TELA, e a tupla fica intacta (src/lib/producao/
// parada-de-maquina.ts, com a cópia no CHECK do banco). Tipado como
// `MotivoDeParada`: um valor que não existe não compila.
//
// É também a lista que decide o "Voltou": o operador fecha a parada que ele
// poderia ter aberto. A preventiva que o gerente registrou é o gerente que
// fecha.
const MOTIVOS_DO_OPERADOR: readonly MotivoDeParada[] = [
  'quebra',
  'troca_agulha',
  'falta_fio',
  'energia',
  'outro',
]

const OPCOES_DE_MOTIVO_DO_OPERADOR = MOTIVOS_DE_PARADA.filter((m) =>
  MOTIVOS_DO_OPERADOR.includes(m.valor),
)

function operadorFechaEstaParada(motivo: string | null): boolean {
  return (
    motivo !== null &&
    (MOTIVOS_DO_OPERADOR as readonly string[]).includes(motivo)
  )
}

type Props = {
  /** Pra "Quem é você?" saber se o nome escolhido é quem já está logado. */
  operadorId: string
  nomeOperador: string
  /** Pra saber se um evento do Realtime é desta estação. */
  estacaoId: string | null
  estacaoNome: string | null
  /** As máquinas da estação, já ordenadas por código. A tela é esta lista. */
  maquinas: MaquinaDaEstacao[]
  /**
   * Quantas na fila e quantas terminadas — DOIS NÚMEROS, não duas listas.
   * O conteúdo delas é buscado quando o operador abre, e não a cada render:
   * quem só olha a estação não paga pela fila de cem OPs.
   */
  contagens: ContagensDaEstacao
  /** Nível do kanban permite agir? Só esconde botão — a action é que decide. */
  podeAgir: boolean
  /**
   * O operador logado já criou PIN? Booleano, NUNCA o hash — este é um
   * componente de cliente, e o que entra aqui vai pro navegador.
   */
  temPin: boolean
  /** `Date.now()` do servidor — a trava grava e decide no relógio dele. */
  horaDoServidor: number
  /** O servidor já considera a sessão travada. */
  travadoNoServidor: boolean
}

// A TRAVA ENVOLVE A TELA INTEIRA: o cabeçalho mostra "(travado)", cada ação
// que grava pergunta "Quem é você?", e os diálogos abertos também recusam
// quando o servidor trava antes da tela — ver troca-operador.tsx.
export function PainelOperador({
  operadorId,
  horaDoServidor,
  travadoNoServidor,
  ...resto
}: Props) {
  return (
    <TravaDoTablet
      horaDoServidor={horaDoServidor}
      travadoNoServidor={travadoNoServidor}
      operadorAtualId={operadorId}
    >
      <Estacao {...resto} />
    </TravaDoTablet>
  )
}

const TABELAS_DO_TABLET = ['ordens_producao', 'maquinas'] as const

function Estacao({
  nomeOperador,
  estacaoId,
  estacaoNome,
  maquinas,
  contagens,
  podeAgir,
  temPin,
}: Omit<Props, 'operadorId' | 'horaDoServidor' | 'travadoNoServidor'>) {
  const router = useRouter()
  const { travado, exigirIdentidade } = useTravaDoTablet()
  const [parada, setParada] = useState<{
    maquina: MaquinaDaEstacao
    modo: 'abrir' | 'fechar'
  } | null>(null)
  const [observacao, setObservacao] = useState<OpNaMaquina | null>(null)
  const [iniciando, setIniciando] = useState<MaquinaDaEstacao | null>(null)
  const [concluindo, setConcluindo] = useState<{
    op: OpNaMaquina
    maquinaCodigo: string
  } | null>(null)
  const [devolvendo, setDevolvendo] = useState<{
    op: OpNaMaquina
    maquinaCodigo: string
  } | null>(null)
  const [consultando, setConsultando] = useState<'fila' | 'terminadas' | null>(
    null,
  )

  // Realtime: sem isto a máquina que o colega acabou de ocupar continua
  // aparecendo como livre, e o próximo toque leva um erro que a tela poderia
  // ter evitado. Escuta as DUAS tabelas que desenham o cartão — a OP diz se
  // está ocupada, a máquina diz se está indisponível.
  //
  // ⚠️ MAS SÓ PELO QUE É DESTA ESTAÇÃO. O tablet fica ligado o dia inteiro, e
  // recarregar a tela a cada OP da fábrica inteira era cada tablet segurando
  // conexão do banco por mudança que não aparece nele. Quem decide é
  // `reacaoDaEstacao` (src/lib/producao/recarga-da-estacao.ts): recarrega a
  // tela, só recalcula Fila e Terminadas, ou ignora.
  //
  // Os contadores vivem em estado pra poderem mudar sem recarregar a tela; a
  // cada render novo do servidor eles voltam a ser os da página.
  const [contagensDaPagina, setContagensDaPagina] = useState(contagens)
  const [contagensVivas, setContagensVivas] = useState(contagens)
  if (contagensDaPagina !== contagens) {
    setContagensDaPagina(contagens)
    setContagensVivas(contagens)
  }

  // O "Atualizar" da faixa de queda tem estado próprio: sem ele, o toque não
  // devolve nada e o dedo volta a tocar — e o segundo toque, num tablet
  // offline, é a diferença entre "está carregando" e "o botão não funciona".
  // `router.refresh()` dentro da transição mantém `atualizando` verdadeiro
  // até a tela nova chegar.
  const [atualizando, iniciarAtualizacao] = useTransition()

  const conectado = useRecargaAoVivo<'tela' | 'contadores'>({
    canal: 'painel-operador-realtime',
    tabelas: TABELAS_DO_TABLET,
    // Voltando de uma queda, recarrega a TELA inteira: o que mudou enquanto o
    // canal esteve fora não chega por evento, e pode ter sido qualquer coisa
    // — máquina ocupada, OP concluída, parada aberta.
    reacaoNaVolta: 'tela',
    decidir: (evento) =>
      reacaoDaEstacao(evento, {
        estacaoId,
        maquinaIds: new Set(maquinas.map((m) => m.id)),
        opIdsNosCartoes: new Set(
          maquinas.flatMap((m) => (m.op ? [m.op.id] : [])),
        ),
        opIdsContados: new Set(contagensVivas.ids),
      }),
    executar: (tipos) => {
      // A tela inteira já traz os contadores junto.
      if (tipos.has('tela')) {
        router.refresh()
        return
      }
      contarOpsDaEstacao()
        .then(setContagensVivas)
        .catch(() => {})
    },
  })

  // SEM ESTAÇÃO A TELA INTEIRA VIRA O AVISO, e não um toast que some.
  //
  // Sem estação ele não tem máquina nenhuma pra mostrar, não consegue pegar
  // OP (`pegarOrdemAction` recusa) nem agir em OP alguma
  // (`operadorPodeAgirNaOrdem` recusa). Mostrar uma grade vazia seria deixar
  // ele procurar o que não existe.
  if (!estacaoNome) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-8 text-center">
          <TriangleAlert className="mx-auto size-12 text-amber-600 dark:text-amber-400" />
          <h1 className="mt-4 text-2xl font-semibold">
            Você ainda não está em nenhuma estação.
          </h1>
          <p className="mt-2 text-lg text-amber-800 dark:text-amber-200">
            Chame o Willian.
          </p>
        </div>
      </div>
    )
  }

  const ocupadas = maquinas.filter((m) => m.op !== null).length

  return (
    <div className="space-y-4">
      {/* Cabeçalho: quem sou, onde estou, quanto da estação está rodando.
          Tudo numa faixa só — ele lê isso uma vez ao chegar, não é o
          conteúdo da tela, e cada linha aqui é um cartão a menos à vista.

          ⚠️ `sticky`: o NOME não pode sair da tela. Num tablet compartilhado,
          "quem está logado" é a informação que decide se o registro vai sair
          no nome certo — e ela não serve pra nada se só aparece quando a
          grade está rolada até o topo. */}
      <div className="bg-background sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3">
        <h1 className="text-xl font-semibold">
          {nomeOperador}
          {/* TRAVADO, O NOME DEIXA DE SER "QUEM ESTÁ TRABALHANDO" e passa a
              ser só a última pessoa que usou. Dizer isso no cabeçalho, e não
              numa faixa fixa: a faixa ocuparia o dia inteiro a altura
              calibrada pra caber nove máquinas. */}
          {travado && (
            <span className="text-muted-foreground font-normal"> (travado)</span>
          )}
          <span className="text-muted-foreground font-normal"> · </span>
          <span className="text-muted-foreground font-normal">
            {estacaoNome}
          </span>
        </h1>
        <p className="text-muted-foreground text-base tabular-nums">
          {ocupadas}/{maquinas.length} produzindo
        </p>

        {/* SEM CONEXÃO AO VIVO — a tela precisa DIZER que pode estar velha.
            Era o único dos quatro lugares que usam o canal sem mostrar o
            estado dele: a /fabrica mostra, o tablet não mostrava. E é
            justamente o tablet que fica horas ocioso, com o Android
            suspendendo a aba e derrubando o socket em silêncio.

            ⚠️ DENTRO DA FAIXA DO CABEÇALHO, que já é `sticky` e já reserva
            altura: uma faixa própria empurraria a grade pra baixo no momento
            exato em que o operador vai tocar num botão — e ele tocaria no
            botão errado. Aqui ela ocupa o espaço que já existe entre o
            contador e os acessos. */}
        {!conectado && (
          <span className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-base text-amber-800 dark:text-amber-200">
            <WifiOff className="size-5 shrink-0" />
            <span>Sem conexão ao vivo. A tela pode estar desatualizada.</span>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-base"
              loading={atualizando}
              disabled={atualizando}
              onClick={() => iniciarAtualizacao(() => router.refresh())}
            >
              {!atualizando && <RefreshCw className="size-4" />}
              {atualizando ? 'Atualizando…' : 'Atualizar'}
            </Button>
          </span>
        )}

        {/* OS DOIS ACESSOS SEPARADOS. A fila e as terminadas saíram da área
            principal — aqui elas viram contador, e o contador não empurra
            nada pra baixo por mais que a fila cresça. */}
        <div className="ml-auto flex flex-wrap gap-2">
          {/* TROCAR OPERADOR fica AQUI, colado no nome, e não no rodapé da
              sidebar como o "Sair". A troca de turno é a ação mais frequente
              desta tela depois de concluir uma OP; enterrá-la atrás de um
              menu é o que fazia o operador da noite registrar no nome do
              operador do dia. */}
          <TrocarOperadorBotao temPin={temPin} />
          <Button
            variant="outline"
            className="h-11 text-base"
            onClick={() => setConsultando('fila')}
          >
            Fila ({contagensVivas.fila})
          </Button>
          <Button
            variant="outline"
            className="h-11 text-base"
            onClick={() => setConsultando('terminadas')}
          >
            Terminadas ({contagensVivas.terminadas})
          </Button>
        </div>
      </div>

      {maquinas.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-base">
          Nenhuma máquina vinculada à sua estação. Fale com o admin.
        </p>
      ) : (
        // TRÊS COLUNAS NO TABLET, quatro no monitor do gerente. Nove
        // máquinas em três colunas são TRÊS LINHAS — a estação inteira numa
        // tela só, que é a única coisa que esta grade existe pra dar.
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
          {maquinas.map((m) => (
            // ⚠️ TODA AÇÃO QUE GRAVA PASSA POR `exigirIdentidade`. Travado,
            // ela pergunta "Quem é você?" e segue sozinha depois do PIN;
            // destravado, é o toque de sempre.
            <CartaoMaquina
              key={m.id}
              maquina={m}
              podeAgir={podeAgir}
              onIniciar={() => exigirIdentidade(() => setIniciando(m))}
              onConcluir={() =>
                exigirIdentidade(
                  () =>
                    m.op &&
                    setConcluindo({ op: m.op, maquinaCodigo: m.codigo }),
                )
              }
              onParou={() =>
                exigirIdentidade(() => setParada({ maquina: m, modo: 'abrir' }))
              }
              onVoltou={() =>
                exigirIdentidade(() =>
                  setParada({ maquina: m, modo: 'fechar' }),
                )
              }
              onObservacao={() => m.op && setObservacao(m.op)}
              onDevolver={() =>
                exigirIdentidade(
                  () =>
                    m.op &&
                    setDevolvendo({ op: m.op, maquinaCodigo: m.codigo }),
                )
              }
            />
          ))}
        </div>
      )}

      {devolvendo && (
        <DevolverDialog
          op={devolvendo.op}
          maquinaCodigo={devolvendo.maquinaCodigo}
          onClose={() => setDevolvendo(null)}
        />
      )}

      {iniciando && (
        <IniciarProducaoDialog
          maquina={iniciando}
          onClose={() => setIniciando(null)}
        />
      )}

      {parada && (
        <ParadaDoOperador
          maquina={parada.maquina}
          modo={parada.modo}
          onClose={() => setParada(null)}
        />
      )}

      {observacao?.observacoes && (
        <ObservacaoDialog op={observacao} onClose={() => setObservacao(null)} />
      )}

      {concluindo && (
        <ConcluirDialog
          op={concluindo.op}
          maquinaCodigo={concluindo.maquinaCodigo}
          onClose={() => setConcluindo(null)}
        />
      )}
      {consultando && (
        <ConsultaDialog
          destino={consultando}
          total={
            consultando === 'fila'
                ? contagensVivas.fila
                : contagensVivas.terminadas
          }
          onClose={() => setConsultando(null)}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------
// O cartão da máquina
// -----------------------------------------------------------------

function CartaoMaquina({
  maquina: m,
  podeAgir,
  onIniciar,
  onConcluir,
  onParou,
  onVoltou,
  onObservacao,
  onDevolver,
}: {
  maquina: MaquinaDaEstacao
  podeAgir: boolean
  onIniciar: () => void
  onConcluir: () => void
  onParou: () => void
  onVoltou: () => void
  onObservacao: () => void
  onDevolver: () => void
}) {
  const { agoraNoServidor } = useTravaDoTablet()
  // OS DOIS EIXOS, e não um estado colapsado. A versão anterior escolhia um
  // vencedor ("ocupada vence indisponível") e escondia a manutenção de uma
  // máquina que tinha trabalho preso dentro — justamente o caso em que o
  // operador mais precisa ver as duas coisas.
  const s = situacaoDaMaquina(m.status, m.op !== null)
  const impedida = s.disponibilidade !== 'apta'

  // "Há quanto tempo" no relógio do SERVIDOR, que foi quem gravou o início.
  const desde = useDuracaoDesde(
    m.paradaAberta?.iniciadaEm ?? null,
    agoraNoServidor,
  )

  // PAROU: máquina apta, com ou sem OP dentro. VOLTOU: parada de manutenção
  // com um dos motivos do operador — setup, desativada e a preventiva do
  // gerente são cadastro de quem planeja, e quem abriu é quem fecha.
  const podeParar = podeAgir && !impedida
  const podeVoltar =
    podeAgir &&
    m.status === 'manutencao' &&
    operadorFechaEstaParada(m.paradaAberta?.motivo ?? null)

  return (
    <div
      className={cn(
        'flex min-h-24 flex-col rounded-xl border-2 p-2.5',
        s.tom === 'producao' && 'border-primary/40',
        // ⚠️ IMPEDIDA COM OP NÃO APAGA O CARTÃO. Só a impedida E vazia fica
        // tracejada e esmaecida: ali não há nada pra ler. Com trabalho
        // dentro, o cartão continua legível — quem está na frente dela
        // precisa enxergar a peça, não um retângulo cinza.
        //
        // A que o OPERADOR PODE LIBERAR não esmaece: o "Voltou" é a ação
        // principal dela, e botão principal em cartão apagado parece
        // desabilitado.
        impedida &&
          s.ocupacao === 'livre' &&
          !podeVoltar &&
          'bg-muted/40 border-dashed opacity-70',
        impedida && (s.ocupacao === 'com_op' || podeVoltar) && 'border-amber-500/50',
        // OP DE FULL: a borda à esquerda na cor do marketplace, a mesma do
        // "Iniciar". Sombra interna, e não borda: não ocupa espaço, então
        // nada no cartão anda — os botões ficam onde ele aprendeu que estão.
        m.op && corDoCanal(m.op.canalDestino)?.borda,
      )}
    >
      {/* O CÓDIGO DA MÁQUINA NO TOPO, sempre — é por ele que ele acha o
          cartão da máquina em que está de pé.
          O NÚMERO DA OP VEM PRA CÁ, na mesma linha: ele é identificação, não
          conteúdo, e ocupando uma linha própria lá embaixo custava altura em
          nove cartões pra dizer o que ninguém lê de longe. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold tabular-nums">
          {m.codigo}
        </span>
        {m.op && (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-muted-foreground truncate text-xs tabular-nums">
              {m.op.numero}
            </span>
            {/* "PEGUEI ERRADO" NO TOPO, LONGE DO "CONCLUIR". O botão grande
                fica no rodapé do cartão; um dedo que erra ele não pode cair
                em desfazer produção. Discreto de propósito — é a exceção,
                não o gesto do dia — e na linha que já existia: o cartão não
                cresce, os botões não saem do lugar. Confirma antes. */}
            {podeAgir && (
              <button
                type="button"
                onClick={onDevolver}
                className="text-muted-foreground hover:text-foreground shrink-0 text-xs underline underline-offset-2"
              >
                Peguei errado
              </button>
            )}
          </span>
        )}
      </div>

      {/* A MANCHETE DO IMPEDIMENTO, e ela aparece MESMO com OP dentro. É a
          linha que responde "por que esta máquina está parada se tem peça
          nela?" — sem ela, o operador ficaria esperando a máquina voltar
          sozinha.

          COM PARADA REGISTRADA, A MANCHETE É O MOTIVO: "Parada: falta de fio
          · há 2 h". "Em manutenção" não diz o que esperar nem desde quando.
          UMA LINHA SÓ, cortada com reticências — o "Outro" traz o texto que
          alguém digitou, que pode ser longo, e o inteiro está no diálogo do
          "Voltou". Setup e desativada vêm do cadastro, sem motivo, e ficam
          com o rótulo de sempre. */}
      {impedida && (
        <p className="mt-0.5 truncate text-sm font-medium text-amber-700 dark:text-amber-400">
          {m.paradaAberta && m.paradaAberta.motivo !== null
            ? `Parada: ${oQueParou(m.paradaAberta)}${desde ? ` · há ${desde}` : ''}`
            : s.rotulo}
        </p>
      )}

      {/* O TRABALHO CONTINUA ACESSÍVEL SOB MANUTENÇÃO, de propósito. Entrar
          em manutenção não conclui, não cancela e não desvincula a OP — ela
          segue `em_producao` naquela máquina, e o índice único já impede que
          outra entre ali. O que o operador precisa é poder CONCLUIR o que
          ficou dentro quando a máquina voltar; esconder o botão prenderia a
          OP até alguém mexer no cadastro. */}
      {s.ocupacao === 'com_op' && m.op && (
        <CorpoOcupada
          op={m.op}
          podeAgir={podeAgir}
          onConcluir={onConcluir}
          onObservacao={onObservacao}
          secundaria={
            podeVoltar ? (
              <BotaoSecundario onClick={onVoltou}>Voltou</BotaoSecundario>
            ) : podeParar ? (
              <BotaoSecundario onClick={onParou}>Parou</BotaoSecundario>
            ) : null
          }
        />
      )}

      {s.aceitaNovaOp && (
        <div className="flex flex-1 flex-col justify-end gap-1.5 pt-1.5">
          <p className="text-muted-foreground text-center text-sm">
            Máquina livre
          </p>
          {podeAgir && (
            // A AÇÃO DA FILEIRA DIVIDE O ESPAÇO, e não ganha linha própria:
            // uma fileira a mais em nove cartões é a terceira linha da grade
            // saindo da tela. O rótulo secundário encurta ("Parou"), mas
            // continua sendo verbo — nunca um ícone pra adivinhar.
            <div className="flex gap-1.5">
              <Button className="h-12 min-w-0 flex-1 px-2 text-base" onClick={onIniciar}>
                Iniciar produção
              </Button>
              <BotaoSecundario onClick={onParou}>Parou</BotaoSecundario>
            </div>
          )}
        </div>
      )}

      {/* IMPEDIDA E VAZIA: o "Voltou" é a ação PRINCIPAL quando é o operador
          quem libera. Nos outros impedimentos não há botão nenhum — a máquina
          não pode receber OP, e um botão que só devolve erro é pior do que
          nenhum. */}
      {impedida && s.ocupacao === 'livre' && (
        <div className="flex flex-1 flex-col justify-end pt-1.5">
          {podeVoltar ? (
            <Button className="h-12 w-full text-base" onClick={onVoltou}>
              Voltou
            </Button>
          ) : (
            <p className="text-muted-foreground flex flex-1 items-center justify-center text-center text-sm">
              Não pode receber OP agora
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Secundária de fileira dividida: mesma altura de 48px da principal — o alvo
// não encolhe —, e só a largura do rótulo curto.
function BotaoSecundario({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="outline"
      className="h-12 shrink-0 px-3 text-base"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function CorpoOcupada({
  op,
  podeAgir,
  onConcluir,
  onObservacao,
  secundaria,
}: {
  op: OpNaMaquina
  podeAgir: boolean
  onConcluir: () => void
  onObservacao: () => void
  /** "Parou" ou "Voltou", dividindo a fileira com "Concluir produção". */
  secundaria: React.ReactNode
}) {
  const temObservacao = Boolean(op.observacoes)
  // Com observação, o BLOCO DO TÍTULO INTEIRO vira o alvo do toque. Ele já tem
  // mais de 48px de altura, então a marca não custa linha nenhuma — e sem
  // observação o bloco é só leitura, sem nada a mais.
  const Bloco = temObservacao ? 'button' : 'div'
  return (
    <>
      {/* ⚠️ A MESMA LINHA DA FILA DE ESCOLHA, montada pela MESMA função
          (`linhaDaOp`) e com o MESMO swatch ao lado. Ele escolhe a OP na
          fila e depois passa o turno olhando este cartão — se as duas telas
          montassem o texto por conta própria, conferir se pegou a peça certa
          passaria a exigir tradução.

          O swatch aqui é `sm` (28px) e não `lg`: o cartão vive numa grade de
          três colunas, e 48px de mancha comeriam a largura do nome. */}
      {/* A OBSERVAÇÃO NÃO PODE SER SÓ DE QUEM INICIA. Ela aparecia apenas no
          fluxo de iniciar, e quem pega a OP já rodando na troca de turno
          nunca via "usar o fio do lote velho". */}
      <Bloco
        {...(temObservacao
          ? {
              type: 'button' as const,
              onClick: onObservacao,
              'aria-label': `Ler a observação da OP ${op.numero}`,
            }
          : {})}
        className={cn(
          'mt-1 flex w-full items-start gap-2 text-left',
          temObservacao &&
            'hover:bg-muted/40 focus-visible:ring-ring -mx-1 rounded-md px-1 focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <ColorSwatch
          hex={op.corHex}
          hex2={op.corHex2}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          {/* A LINHA DO TRELLO: "059 - Peseira LINKS - QUEEN - AREIA".
              ⚠️ NO MÁXIMO DUAS LINHAS (`line-clamp-2`). O código e o modelo
              dentro do nome deixaram o texto mais comprido que o título
              antigo, e o cartão tem posição fixa: se o título crescesse, os
              botões de baixo desceriam, e o operador acerta o botão de
              memória. O texto inteiro está no diálogo de concluir. */}
          <div className="line-clamp-2 text-base leading-tight">
            <LinhaDaPeca op={op} />
          </div>
          {/* META, NÃO PROGRESSO. Ver o cabeçalho do arquivo: o registro é
              feito só no fim, então uma barra ficaria zerada o turno
              inteiro.

              O DESTINO DIVIDE A LINHA COM ELA, no lugar do modelo — que agora
              já vem no nome do produto, dentro da linha do Trello. Nada novo
              entra no cartão: o que chegou ocupa o espaço de quem saiu.

              ⚠️ UMA LINHA, E NÃO QUEBRA. Quem cede quando falta largura é o
              DESTINO, cortado com reticências; a meta e a marca da observação
              ficam inteiras. E a marca encurta pra "obs." abaixo de `lg`,
              onde as três colunas deixam o cartão estreito demais pra
              "tem observação" caber ao lado da meta. */}
          <p className="text-muted-foreground flex min-w-0 items-baseline gap-1 text-sm whitespace-nowrap tabular-nums">
            <span className="min-w-0 truncate">
              <Destino texto={op.destino} /> ·
            </span>
            <span className="text-foreground shrink-0 font-semibold">
              Meta: {op.quantidade} peças
            </span>
            {temObservacao && (
              <span className="text-primary inline-flex shrink-0 items-center font-medium">
                ·&nbsp;
                <span className="hidden lg:inline">tem observação</span>
                <span className="lg:hidden">obs.</span>
                <ChevronRight className="size-3.5" />
              </span>
            )}
          </p>
        </div>
      </Bloco>
      {/* OP LEGADA, com apontamento já feito. Não some com o número dele só
          porque a barra saiu — mas fica discreto, fora do caminho. */}
      {(op.produzido > 0 || op.refugo > 0) && (
        <p className="text-muted-foreground text-xs tabular-nums">
          já registradas: {op.produzido}
          {op.refugo > 0 && ` · ${op.refugo} refugo`}
        </p>
      )}

      {/* QUEM ESTÁ COM ELA, e SÓ quando há alguém. Antes esta linha existia
          sempre, pra carregar o número da OP que agora vive no topo — então
          em toda OP sem responsável ela era uma linha em branco custando
          altura em nove cartões. */}
      {op.responsavelNome && (
        <div className="text-muted-foreground truncate text-xs">
          com {op.responsavelNome}
        </div>
      )}

      {/* UM BOTÃO SÓ, e não é economia de espaço.
          Eram dois — "Apontar" e "Terminei" —, cada um numa action e numa
          transação. Com os dois, o operador conseguia criar sem querer dois
          estados que a tela dele não desfaz: apontou e a tela caiu antes de
          terminar (número gravado, máquina ainda ocupada), ou terminou sem
          apontar (máquina livre, número que nunca existiu). Com um, o gesto
          é o do mundo físico: acabou, registra e sai da máquina. */}
      {/* ⚠️ O BOTÃO NÃO ENCOLHEU. Tudo em volta ficou menor pra caber a
          estação numa tela; o alvo de toque continua em 48px, que é o piso
          das diretrizes. Texto pequeno se lê chegando perto — alvo pequeno
          se erra com o dedo sujo de fiapo, e errar aqui grava número. */}
      {podeAgir && (
        <div className="mt-auto flex gap-1.5 pt-2">
          <Button
            className="h-12 min-w-0 flex-1 px-2 text-base"
            onClick={onConcluir}
          >
            Concluir produção
          </Button>
          {secundaria}
        </div>
      )}
    </>
  )
}

// -----------------------------------------------------------------
// Iniciar produção — a fila, com a máquina JÁ escolhida
// -----------------------------------------------------------------

// A MÁQUINA VEM DO CARTÃO, e não é perguntada de novo: ele tocou no cartão da
// TC-02, a OP vai pra TC-02. É o inverso do fluxo antigo (escolher a OP e
// depois a máquina), e é o que faz a tela seguir a estação física. O código
// dela fica no título e volta no passo de confirmação — a pergunta "em qual
// máquina mesmo?" nunca precisa ser feita.
//
// ⚠️ QUEM DECIDE O QUE APARECE É O SERVIDOR, `listarOpsParaIniciar`. Esta
// tela não filtra nada: filtrar aqui exigiria carregar a fila inteira pro
// tablet pra esconder a maior parte dela, que é vazamento com aparência de
// filtro. E a lista do servidor é a MESMA que `pegarOrdemAction` aceita
// (`STATUS_QUE_INICIAM`), então o que ele vê é o que ele consegue iniciar.
//
// ─────────────────────────────────────────────────────────────────────────
// QUANDO PERGUNTA ANTES, E QUANDO NÃO PERGUNTA
// ─────────────────────────────────────────────────────────────────────────
//
// O caso comum é UM TOQUE: escolheu a OP, começou. O passo de confirmação
// aparece só quando há o que ler antes:
//
//   - a OP tem OBSERVAÇÃO. É o campo onde o gerente escreve "usar o fio do
//     lote velho" ou "cliente pediu barra dupla". Mostrar num rodapé de
//     linha, em letra pequena, junto de mais dez OPs, é o mesmo que não
//     mostrar;
//   - a OP está AGUARDANDO MATÉRIA-PRIMA. Aí a pergunta é literal e a
//     resposta vira linha no histórico — ver src/lib/producao/inicio-da-op.ts.
//
// Sem nenhum dos dois, não há passo nenhum. Um diálogo de confirmação que
// aparece sempre vira um botão a mais que ninguém lê.
function IniciarProducaoDialog({
  maquina,
  onClose,
}: {
  maquina: MaquinaDaEstacao
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [termo, setTermo] = useState('')
  const [lista, setLista] = useState<ListaDoIniciar | null>(null)
  const [buscando, setBuscando] = useState(true)
  // Quais blocos de destino estão ABERTOS. Decidido a cada lista que chega
  // (`blocosAbertosPorPadrao`, rotulo-da-op.ts), e depois é do operador:
  // tocar abre e fecha.
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState<OpParaIniciar | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const { exigirIdentidade, travarEPerguntar } = useTravaDoTablet()

  // BUSCA COM DEBOUNCE, mesmo padrão do global-search: 200ms. Sem ele, cada
  // tecla vira uma consulta, e num tablet a digitação é lenta o bastante pra
  // isso virar dez consultas por palavra.
  //
  // A LISTA VEM INTEIRA (com teto — ver `listarOpsParaIniciar`), e não em
  // páginas: o bloco de destino precisa de todas as OPs dele pra contar certo
  // e pra entrar na posição da mais urgente.
  //
  // `setBuscando` fica DENTRO do timeout, e não no corpo do efeito: o React
  // recusa setState sincrono ali (cascata de renders), e de quebra o
  // "Buscando..." deixa de piscar a cada tecla — ele aparece quando a busca
  // sai de verdade.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscando(true)
      listarOpsParaIniciar(maquina.id, { q: termo })
        .then((r) => {
          setLista(r)
          setAbertos(blocosAbertosPorPadrao(agruparPorDestino(r.ops), termo))
        })
        .finally(() => setBuscando(false))
    }, 200)
    return () => clearTimeout(t)
  }, [termo, maquina.id])

  const ops = useMemo(() => lista?.ops ?? [], [lista])
  const blocos = useMemo(() => agruparPorDestino(ops), [ops])

  function definirAberto(chave: string, aberto: boolean) {
    setAbertos((atuais) => {
      const novos = new Set(atuais)
      if (aberto) novos.add(chave)
      else novos.delete(chave)
      return novos
    })
  }

  // Um toque quando não há o que ler antes; passo de confirmação quando há.
  function escolher(op: OpParaIniciar) {
    setErro(null)
    if (op.observacoes || confirmacaoAntesDeIniciar(op.status)) {
      setConfirmando(op)
      return
    }
    exigirIdentidade(() => iniciar(op, false))
  }

  function iniciar(op: OpParaIniciar, materiaPrimaConfirmada: boolean) {
    setErro(null)
    startTransition(async () => {
      marcarEco(op.id)
      const r = await pegarOrdemAction(op.id, maquina.id, {
        materiaPrimaConfirmada,
      })
      if (!r.success) {
        // O TABLET TRAVOU COM O DIÁLOGO ABERTO: pergunta quem é e tenta de
        // novo com a mesma OP, sem ele ter que achar ela na fila outra vez.
        if (r.error === ERRO_TABLET_TRAVADO) {
          travarEPerguntar(() => iniciar(op, materiaPrimaConfirmada))
          return
        }
        // A MENSAGEM FICA NO DIÁLOGO, em tipo grande. Num toast ela
        // apareceria atrás do diálogo aberto e sumiria antes de ele ler.
        setErro(r.error)
        setConfirmando(null)
        return
      }
      toast.success(r.message ?? 'OP em produção')
      router.refresh()
      onClose()
    })
  }

  if (confirmando) {
    return (
      <ConfirmarInicioDialog
        op={confirmando}
        maquina={maquina}
        isPending={isPending}
        erro={erro}
        onConfirmar={() =>
          exigirIdentidade(() => iniciar(confirmando, true))
        }
        onVoltar={() => setConfirmando(null)}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {/* LARGO E ALTO, e não o `max-w-lg` de antes. Num tablet de 1024px
          aquele usava metade da largura pra mostrar quatro de vinte linhas —
          o operador rolava pra ver a fila que já estava paginada. */}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Iniciar na máquina {maquina.codigo}
          </DialogTitle>
          {/* ⚠️ A REGRA DO TOQUE, ESCRITA. "Em produção" começa quando a
              máquina tece, e o tempo de setup fica FORA dele de propósito:
              com o toque dado ao começar a armar a máquina, cada OP carregaria
              o setup dela, e o tempo por coluna do `eventos_kanban` — de onde
              vão sair os limiares do aging — mediria a troca de fio, não a
              produção. */}
          <DialogDescription className="text-base">
            Escolha a OP. Toque quando a máquina começar a tecer.
          </DialogDescription>
        </DialogHeader>

        {/* Busca por número da OP ou produto. Alvo de 48px como o do cartão:
            aqui ele digita pouco, e o teclado do tablet cobre o resto. */}
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2" />
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por OP ou produto"
            className="h-12 pl-10 text-base"
            autoFocus={false}
          />
        </div>

        {/* ⚠️ DOIS NÍVEIS: DESTINO → PRODUTO → OP. O painel do Trello era um
            por Full, e dentro dele uma coluna por produto. Agrupando só por
            produto, três OPs do mesmo Full apareciam em três grupos e o Full
            sumia — e o operador escolhe pensando "o que o caminhão de amanhã
            precisa". Regra em `agruparPorDestino` (rotulo-da-op.ts).

            LISTA LONGA VEM FECHADA, com a contagem e o aviso de prazo no
            cabeçalho: com 60 OPs abertas a lista era rolagem sem fim. Só o
            PRIMEIRO vem aberto — o mais urgente, porque o bloco entra na
            posição da OP mais urgente dele (nada é reordenado). Lista curta
            vem toda aberta, e com busca abrem os blocos onde achou. Regra em
            `blocosAbertosPorPadrao`.

            DENTRO do bloco, os produtos pelo PROGRAMA da máquina
            (`agruparPorProduto`): o setup segue o código — o EFEITO 3D é 076
            na peseira e 115 na manta. */}
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">
          {lista?.cortada && (
            <p className="rounded-lg border border-amber-500/50 p-2 text-sm text-amber-800 dark:text-amber-300">
              Mostrando as {ops.length} mais urgentes de {lista.total}. Use a
              busca pra achar as outras.
            </p>
          )}

          {blocos.map((bloco) => {
            const cor = corDoCanal(bloco.canal)
            const aberto = abertos.has(bloco.chave)
            const alerta = alertaDoBloco(bloco.ops)
            return (
              // ABRE E FECHA ANIMADO, com o `PainelAnimado` — o mesmo das
              // pastas do kanban, no mesmo ritmo (painel-animado.tsx).
              //
              // `overflow-clip` onde o navegador conhece, e não `hidden`:
              // hidden faz do bloco um contêiner de rolagem, e o cabeçalho
              // `sticky` grudaria no bloco (que não rola) em vez de na lista.
              // Navegador velho fica com o hidden: cabeçalho que não gruda,
              // mas canto arredondado certo.
              <Collapsible.Root
                key={bloco.chave}
                open={aberto}
                onOpenChange={(abrir) => definirAberto(bloco.chave, abrir)}
                render={<section />}
                className={cn(
                  'overflow-hidden rounded-xl border-2 supports-[overflow:clip]:overflow-clip',
                  // Bloco que APARECE (a lista chegando, ou a busca trazendo
                  // um destino novo) entra num fade curto, em vez de surgir
                  // seco. Só na montagem: os que já estavam não piscam.
                  'animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none',
                )}
              >
                {/* O CABEÇALHO GRUDA NO TOPO enquanto o bloco passa: a linha
                    da OP não repete o destino, então é ele que diz de quem é
                    a OP num bloco comprido. O fundo opaco embaixo é pro modo
                    escuro, onde a faixa é um véu translúcido — sem ele, as
                    linhas apareceriam através do cabeçalho ao rolar. */}
                <div className="bg-popover sticky top-0 z-10">
                  {/* A FAIXA: texto escuro sobre a cor clara, barra grossa na
                      cor cheia (ver cor-do-canal.ts). Sem cor, a faixa neutra.
                      O nome ("Full ML · Conta 1") continua escrito: quem não
                      distingue amarelo de laranja lê. */}
                  <Collapsible.Trigger
                    className={cn(
                      'flex w-full items-stretch text-left',
                      cor ? cor.faixa : 'bg-muted',
                    )}
                  >
                    {cor && (
                      <span aria-hidden className={cn('w-2.5 shrink-0', cor.barra)} />
                    )}
                    <span className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate text-lg font-semibold">
                        {bloco.cabecalho}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-base font-medium tabular-nums">
                        {bloco.ops.length} {bloco.ops.length === 1 ? 'OP' : 'OPs'}
                        {/* O AVISO, só quando aperta (`alertaDoBloco`): com o
                            bloco fechado, é o que impede a OP atrasada de
                            sumir atrás da contagem. */}
                        {alerta.prazo && (
                          <span className="text-destructive font-bold">
                            {alerta.prazo}
                          </span>
                        )}
                        {alerta.urgente && <SeloDePrioridade prioridade="urgente" />}
                        {/* A seta gira no MESMO ritmo do painel: seta e
                            conteúdo chegando juntos é o que faz parecer um
                            movimento só. */}
                        <ChevronDown
                          className={cn(
                            'size-5 transition-transform',
                            RITMO_DO_PAINEL,
                            aberto && 'rotate-180',
                          )}
                        />
                      </span>
                    </span>
                  </Collapsible.Trigger>
                </div>

                {/* Fechado, o painel desmonta, como o `{aberto && ...}`
                    fazia — bloco fechado não custa render. */}
                <PainelAnimado>
                  <div className="space-y-4 p-2">
                    {bloco.produtos.map((grupo) => (
            <div key={grupo.cabecalho} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                <h3 className="text-lg font-semibold tabular-nums">
                  {grupo.cabecalho}
                </h3>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {grupo.ops.length}{' '}
                  {grupo.ops.length === 1 ? 'OP' : 'OPs'}
                </span>
              </div>

              {grupo.ops.map((op) => (
            <button
              key={op.id}
              type="button"
              disabled={isPending}
              onClick={() => escolher(op)}
              className={cn(
                'hover:border-primary hover:bg-primary/5 focus-visible:ring-ring flex w-full gap-3 rounded-xl border-2 p-2.5 text-left focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50',
                // A COR DO FULL É SÓ UMA BORDA À ESQUERDA, e o conteúdo
                // afasta (`pl-5`) pra ela não encostar no quadradinho — que é
                // a cor do FIO, a que ele confere contra a máquina.
                cor && [cor.borda, 'pl-5'],
              )}
            >
              {/* O SWATCH É A ÂNCORA DO OLHO: ele varre uma coluna de cores
                  em vez de ler nomes de produto que começam igual — e a cor
                  é o que ele confere contra o fio que está na máquina. */}
              <ColorSwatch
                hex={op.corHex}
                hex2={op.corHex2}
                tamanho="lg"
                className="mt-0.5"
              />

              {/* DUAS LINHAS, E ERAM QUATRO. O que saiu: o nome do produto
                  (virou cabeçalho de grupo + a família aqui embaixo) e o
                  número da OP, que é identificação e não decide escolha
                  nenhuma — ele volta só quando há busca, logo abaixo. */}
              <div className="min-w-0 flex-1">
                {/* ⚠️ A FAMÍLIA VEM PRIMEIRO E EM NEGRITO — peseira, manta,
                    capa de almofada. É o que a peça É, e decide o setup da
                    máquina tanto quanto o ponto; tinha perdido destaque
                    quando o nome do produto desceu pra segunda linha.
                    A cor não precisa abrir a frase porque o SWATCH está ao
                    lado: o olho pega a cor pela mancha, o texto confirma. */}
                {/* A LINHA DO TRELLO, código primeiro — a mesma do cartão da
                    máquina. A quantidade fica no canto, como antes. */}
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xl">
                    <LinhaDaPeca op={op} />
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="text-base font-medium tabular-nums">
                      {op.quantidade} pç
                    </span>
                    <SeloDePrioridade prioridade={op.prioridade} />
                  </span>
                </div>

                <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-sm">
                  {/* SEM O DESTINO: ele é o cabeçalho do bloco em volta, que
                      gruda no topo ao rolar, e aqui só repetiria "Full ML ·
                      Conta 1" em toda linha. Ele volta na confirmação e no
                      cartão da máquina, onde não há bloco em volta. */}
                  <Prazo data={op.dataPrevistaFim} />
                  {/* AS TARJAS VIRARAM TEXTO NA MESMA LINHA. Como caixinhas
                      coloridas elas custavam uma quarta linha em toda OP que
                      tivesse uma; aqui avisam sem empurrar nada. */}
                  {confirmacaoAntesDeIniciar(op.status) !== null && (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      aguardando matéria-prima
                    </span>
                  )}
                  {op.observacoes && <span>tem observação</span>}
                  {/* O NÚMERO SÓ QUANDO HÁ BUSCA. Fora da busca ele é ruído
                      que não decide escolha; buscando "0151", some ele a
                      linha que casou pareceria arbitrária. */}
                  {termo.trim() !== '' && <span>{op.numero}</span>}
                </div>
              </div>
            </button>
              ))}
            </div>
                    ))}
                  </div>
                </PainelAnimado>
              </Collapsible.Root>
            )
          })}

          {ops.length === 0 && !buscando && (
            <p className="text-muted-foreground py-8 text-center text-lg">
              {termo
                ? `Nenhuma OP encontrada pra "${termo}".`
                : 'Nenhuma OP disponível pra esta máquina. Fale com o gerente.'}
            </p>
          )}

          {buscando && (
            <p className="text-muted-foreground py-4 text-center text-base">
              Buscando…
            </p>
          )}

        </div>

        {erro && <Erro>{erro}</Erro>}

        <Button
          variant="ghost"
          className="h-14 text-lg"
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// O passo de leitura antes de começar. Existe só quando há o que ler — ver o
// comentário do diálogo acima.
function ConfirmarInicioDialog({
  op,
  maquina,
  isPending,
  erro,
  onConfirmar,
  onVoltar,
}: {
  op: OpParaIniciar
  maquina: MaquinaDaEstacao
  isPending: boolean
  erro: string | null
  onConfirmar: () => void
  onVoltar: () => void
}) {
  const pergunta = confirmacaoAntesDeIniciar(op.status)

  return (
    <Dialog open onOpenChange={(o) => !o && onVoltar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            <LinhaDaPeca op={op} comQuantidade />
          </DialogTitle>
          {/* A MÁQUINA REAPARECE AQUI. Ele escolheu o cartão faz três toques
              e já leu uma lista inteira desde então; confirmar sem ver a
              máquina é onde a OP vai parar na máquina errada. E o destino da
              OP junto: é a última chance de ver pra quem é antes de tecer. */}
          <DialogDescription className="text-base">
            <Destino texto={op.destino} /> · vai pra máquina {maquina.codigo}
          </DialogDescription>
        </DialogHeader>

        {op.observacoes && (
          <div className="border-primary/40 bg-primary/5 rounded-lg border-2 p-3">
            <p className="text-muted-foreground text-sm font-medium">
              Observação do gerente
            </p>
            <p className="mt-1 text-lg">{op.observacoes}</p>
          </div>
        )}

        {/* A PERGUNTA DA MATÉRIA-PRIMA. Ela é o botão: "Sim, o fio está aqui"
            é uma resposta, "Confirmar" não é. A resposta vira linha no
            histórico com o nome de quem respondeu. */}
        {pergunta && (
          <p className="border-destructive/40 bg-destructive/5 rounded-lg border-2 p-3 text-lg font-medium">
            {pergunta}
          </p>
        )}

        {erro && <Erro>{erro}</Erro>}

        <Button
          className="h-16 text-xl"
          loading={isPending}
          disabled={isPending}
          onClick={onConfirmar}
        >
          {pergunta
            ? 'Sim, o fio está aqui — iniciar'
            : `Iniciar na ${maquina.codigo}`}
        </Button>
        <Button
          variant="ghost"
          className="h-12"
          onClick={onVoltar}
          disabled={isPending}
        >
          Voltar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// A linha, o prazo e o selo moram em src/components/ordens/linha-da-peca.tsx,
// compartilhados com /ordens: gerente e operador leem a OP do mesmo jeito.

// PRA ONDE VAI, numa linha curta. A seta é o "vai pra": economiza a palavra e
// não disputa com o prazo, que fica pintado ao lado quando aperta.
function Destino({ texto }: { texto: string }) {
  return <span className="text-foreground font-medium">→ {texto}</span>
}

// O PRAZO, QUE ERA INVISÍVEL. A fila é ordenada por prioridade E prazo, mas
// só a prioridade aparecia — o operador via a ordem sem ver o motivo dela.
// Aqui só aparece OP a produzir, então `prazoEmPalavras` basta.
function Prazo({ data }: { data: Date | null }) {
  return <TextoDoPrazo prazo={prazoEmPalavras(data ? new Date(data) : null)} />
}

// -----------------------------------------------------------------
// Consulta: fila e terminadas (fora da área principal)
// -----------------------------------------------------------------

// SÓ LEITURA. A fila responde "quanto tem pra fazer" e as terminadas
// respondem "o que eu já entreguei" — nenhuma das duas age. Quem inicia é o
// cartão da máquina, que é onde a decisão tem contexto.
//
// ⚠️ CARREGA AO ABRIR, e não junto com a página. O contador do botão vem de
// um COUNT barato; a lista só é buscada quando alguém toca. Numa tela que o
// operador deixa aberta o turno inteiro, a fila de cem OPs não pode entrar
// no custo de cada render.
function ConsultaDialog({
  destino,
  total,
  onClose,
}: {
  destino: 'fila' | 'terminadas'
  total: number
  onClose: () => void
}) {
  const router = useRouter()
  const [ops, setOps] = useState<OpDaConsulta[]>([])
  const [pagina, setPagina] = useState<PaginaDaConsulta | null>(null)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vivo = true
    listarOpsDaEstacao(destino, 1)
      .then((r) => {
        if (!vivo) return
        setPagina(r)
        setOps(r.ops)
        setPaginaAtual(1)
      })
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [destino, recarga])

  // Depois de desfazer, a lista tem que deixar de mostrar a OP como
  // terminada — e a grade atrás precisa mostrar a máquina ocupada de novo.
  function recarregar() {
    setCarregando(true)
    setRecarga((n) => n + 1)
    router.refresh()
  }

  function carregarMais() {
    const proxima = paginaAtual + 1
    setCarregando(true)
    listarOpsDaEstacao(destino, proxima)
      .then((r) => {
        setPagina(r)
        setOps((atuais) => [...atuais, ...r.ops])
        setPaginaAtual(proxima)
      })
      .finally(() => setCarregando(false))
  }

  const ehFila = destino === 'fila'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {ehFila ? 'Fila' : 'Terminadas'} ({total})
          </DialogTitle>
          <DialogDescription className="text-base">
            {ehFila
              ? 'OPs esperando pra começar. Pra iniciar uma, toque em "Iniciar produção" na máquina.'
              : 'Saíram da máquina e esperam o gerente concluir.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {ops.map((op) => (
            <div key={op.id} className="flex gap-3 rounded-xl border p-3">
              <ColorSwatch hex={op.corHex} hex2={op.corHex2} tamanho="lg" />
              <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="truncate text-lg">
                  <LinhaDaPeca op={op} />
                </div>
                <SeloDePrioridade prioridade={op.prioridade} />
              </div>
              {/* O DESTINO NO LUGAR DO MODELO, que já vem no nome do produto.
                  Nas Terminadas é o que diz pra onde a peça segue agora. */}
              <div className="text-muted-foreground truncate text-sm">
                <Destino texto={op.destino} />
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums">
                <span>{op.quantidade} peças</span>
                {ehFila && <Prazo data={op.dataPrevistaFim} />}
                <span className="text-muted-foreground">{op.numero}</span>
                {op.maquinaCodigo && (
                  <span className="text-muted-foreground">
                    {op.maquinaCodigo}
                  </span>
                )}
              </div>

              {/* A CONFIRMAÇÃO QUE O TOAST NÃO GUARDA. "Será que salvou?" é a
                  pergunta que traz o operador aqui, e a resposta é a hora, o
                  número e o nome — não só a OP na lista. */}
              {ehFila === false && op.concluidaEm && (
                <div className="mt-2 border-t pt-2">
                  <p className="text-base tabular-nums">
                    {op.produzido} peças
                    {op.refugo > 0 && ` · ${op.refugo} refugo`}
                    {' · '}
                    {hora(op.concluidaEm)}
                    {op.concluidaPor && ` · ${op.concluidaPor}`}
                  </p>
                  {op.resumo && (
                    <p className="text-muted-foreground mt-0.5 text-sm">
                      {op.resumo}
                    </p>
                  )}
                  {op.podeDesfazer && (
                    <BotaoDesfazer op={op} onFeito={recarregar} />
                  )}
                </div>
              )}
              </div>
            </div>
          ))}

          {ops.length === 0 && !carregando && (
            <p className="text-muted-foreground py-8 text-center text-lg">
              {ehFila
                ? 'Nada na fila no momento.'
                : 'Nenhuma OP esperando o gerente.'}
            </p>
          )}

          {carregando && (
            <p className="text-muted-foreground py-4 text-center text-base">
              Carregando…
            </p>
          )}

          {pagina?.temMais && !carregando && (
            <Button
              variant="outline"
              className="h-12 w-full text-base"
              onClick={carregarMais}
            >
              Carregar mais ({ops.length} de {pagina.total})
            </Button>
          )}
        </div>

        <Button variant="ghost" className="h-14 text-lg" onClick={onClose}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Concluir produção — o registro e o fim, num gesto só
// -----------------------------------------------------------------

// ⚠️ O NÚMERO JÁ VEM PREENCHIDO, MAS NADA É GRAVADO SEM O TOQUE. A meta é a
// sugestão, e o botão CARREGA O NÚMERO ("Concluir com 30 peças boas"): ele
// não confirma "ok", confirma o valor que vai ficar no banco. É o que separa
// "poupar digitação" de "assumir que fez tudo" — no caso normal, em que
// saiu a OP inteira, ele lê o número e toca uma vez.
//
// ⚠️ O TETO É A META DO GERENTE (src/lib/producao/conclusao.ts). O teclado
// RECUSA o dígito que passaria do limite, em vez de aceitar e reclamar
// depois: número errado que aparece na tela por um instante é número que
// alguém pode confirmar sem reler. Refugo não tem teto — peça perdida não é
// produção.
//
// ⚠️ E O QUE JÁ FOI REGISTRADO NÃO CONTA DE NOVO. Numa OP que já tem
// apontamento (legado, ou o gerente pelo sheet), o sugerido e o teto são o
// QUE FALTA, com o "já registradas: X" à vista pra explicar por que o número
// não é a meta cheia.
//
// A confirmação é um diálogo e não um toast-com-desfazer: toque acidental no
// tablet é comum — a mão encosta na tela ao apoiar — e desfazer exigiria ler
// rápido uma tarja que some. Aqui a pergunta espera.

type Campo = 'produzida' | 'refugo'

// Chaveado pela OP: dois cartões abertos em sequência não misturam número.
function chaveDoRascunho(ordemId: string): string {
  return `vv_conclusao_${ordemId}`
}

// ⚠️ TODA LEITURA E ESCRITA DE RASCUNHO É ENVOLVIDA EM try/catch. Em aba
// anônima, com armazenamento bloqueado ou com o JSON corrompido, o
// localStorage LANÇA — e rascunho é conveniência: nunca pode impedir o
// diálogo de abrir nem a conclusão de salvar.
function lerRascunho(chave: string): Record<Campo, string> | null {
  try {
    const salvo = localStorage.getItem(chave)
    return salvo ? (JSON.parse(salvo) as Record<Campo, string>) : null
  } catch {
    return null
  }
}

function ConcluirDialog({
  op,
  maquinaCodigo,
  onClose,
}: {
  op: OpNaMaquina
  maquinaCodigo: string
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { exigirIdentidade, travarEPerguntar } = useTravaDoTablet()
  const conclusao = calcularConclusao(op.quantidade, op.produzido)
  const [ativo, setAtivo] = useState<Campo>('produzida')
  const chave = chaveDoRascunho(op.id)
  // A leitura do rascunho acontece na INICIALIZAÇÃO do estado, e não num
  // efeito: setState síncrono dentro de efeito é cascata de render (o React
  // recusa), e aqui isso apareceria como o campo piscando do sugerido pro
  // guardado. Este diálogo só monta depois de um toque, então não há
  // hidratação pra divergir.
  const [valores, setValores] = useState<Record<Campo, string>>(
    () =>
      lerRascunho(chave) ?? {
        // Sem rascunho: já preenchido com o que falta — no fluxo novo, a
        // meta inteira.
        produzida: String(conclusao.restante),
        refugo: '',
      },
  )
  const [restaurado] = useState(() => lerRascunho(chave) !== null)
  const [erro, setErro] = useState<string | null>(null)

  // ⚠️ O RASCUNHO SOBREVIVE AO FECHAMENTO — e não é capricho de UX.
  //
  // Três coisas apagam o que ele digitou sem ele mandar: o toque acidental
  // fora do diálogo (a mão encosta na tela ao apoiar), o F5, e o LOGOFF POR
  // INATIVIDADE de 30 minutos, que a Fase 4 acabou de construir. O terceiro é
  // o pior: Server Actions passam pelo proxy, então a sessão expirada vira
  // redirect pro login com os números perdidos.
  //
  // Guardar em localStorage resolve os três de uma vez, e é melhor que um
  // "tem certeza que quer fechar?": aquele protege contra o toque e não
  // protege contra os outros dois — e ainda cobra um toque a mais de quem só
  // queria sair.
  //
  // Chaveado pela OP: dois cartões abertos em sequência não misturam número.

  function guardar(v: Record<Campo, string>) {
    try {
      localStorage.setItem(chave, JSON.stringify(v))
    } catch {
      // Sem localStorage o diálogo continua funcionando; só não lembra.
    }
  }
  function esquecer() {
    try {
      localStorage.removeItem(chave)
    } catch {}
  }

  const produzida = Number(valores.produzida || 0)
  const refugo = Number(valores.refugo || 0)

  // TECLADO PRÓPRIO NA TELA, e não o do tablet: o do sistema cobre metade da
  // tela, some sozinho e às vezes nem abre quando há teclado físico
  // acoplado. Aqui a tecla é sempre a mesma, sempre no mesmo lugar.
  function digitar(d: string) {
    setErro(null)
    setValores((v) => {
      const novoTexto = (v[ativo] + d).replace(/^0+(?=\d)/, '')
      if (novoTexto.length > 4) return v
      // O TETO BARRA O DÍGITO. Passar do limite não chega a virar valor na
      // tela: é a diferença entre "não dá pra digitar isso" e "digitou e
      // depois toma um erro", e a segunda deixa o número errado à vista.
      if (ativo === 'produzida' && Number(novoTexto) > conclusao.restante) {
        setErro(
          erroDeQuantidade(Number(novoTexto), refugo, conclusao) ??
            'Quantidade acima da meta',
        )
        return v
      }
      const novo = { ...v, [ativo]: novoTexto }
      guardar(novo)
      return novo
    })
  }
  function apagar() {
    setErro(null)
    setValores((v) => {
      const novo = { ...v, [ativo]: v[ativo].slice(0, -1) }
      guardar(novo)
      return novo
    })
  }
  function limpar() {
    setErro(null)
    setValores((v) => {
      const novo = { ...v, [ativo]: '' }
      guardar(novo)
      return novo
    })
  }

  function concluir() {
    setErro(null)
    startTransition(async () => {
      marcarEco(op.id)
      const r = await concluirProducaoAction(op.id, { produzida, refugo })
      if (!r.success && r.error === ERRO_TABLET_TRAVADO) {
        // O rascunho fica no localStorage; depois do PIN, conclui com os
        // mesmos números.
        travarEPerguntar(concluir)
        return
      }
      if (!r.success) {
        // O RASCUNHO FICA. A falha é o momento em que ele mais precisa do
        // número preservado — é o que ele vai reenviar.
        setErro(r.error)
        return
      }
      esquecer()
      // Inclui o caso "já estava concluída" (reenvio depois de queda de
      // conexão), que a action devolve como sucesso de propósito.
      //
      // 8 segundos, e não os ~4 do padrão: esta é a confirmação de que o
      // trabalho do turno foi gravado, com o número. Ele precisa conseguir
      // ler — e se perder, "Terminadas" tem a mesma frase guardada.
      toast.success(r.message ?? 'Produção concluída', { duration: 8000 })
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            <LinhaDaPeca op={op} />
          </DialogTitle>
          {/* MÁQUINA, OP, META E DESTINO na mesma linha: é o que ele confere
              antes de gravar, e some do cartão no instante seguinte. */}
          <DialogDescription className="text-base">
            <Destino texto={op.destino} /> · {op.numero} · máquina{' '}
            {maquinaCodigo} · meta {op.quantidade}
          </DialogDescription>
        </DialogHeader>

        {/* Volta a dizer o que estava escrito quando ele saiu, pra que o
            número na tela não pareça sugestão do sistema. */}
        {restaurado && (
          <p className="border-primary/40 bg-primary/5 rounded-lg border-2 p-2 text-center text-base">
            Recuperamos o que você tinha digitado.
          </p>
        )}

        {conclusao.jaRegistrado > 0 && (
          <p className="text-muted-foreground text-base tabular-nums">
            já registradas: {conclusao.jaRegistrado} · falta{' '}
            {conclusao.restante}
          </p>
        )}

        {/* Dois campos, um ativo por vez. O destaque é BORDA GROSSA + anel,
            não só cor: no galpão a tela leva sol de lado, e diferença de
            matiz some. */}
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            rotulo="Peças boas"
            valor={valores.produzida}
            ativo={ativo === 'produzida'}
            onSelecionar={() => setAtivo('produzida')}
          />
          <CampoNumero
            rotulo="Refugo"
            valor={valores.refugo}
            ativo={ativo === 'refugo'}
            onSelecionar={() => setAtivo('refugo')}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <TeclaNumerica key={d} onClick={() => digitar(d)} disabled={isPending}>
              {d}
            </TeclaNumerica>
          ))}
          <TeclaNumerica onClick={limpar} disabled={isPending} aria-label="Limpar">
            C
          </TeclaNumerica>
          <TeclaNumerica onClick={() => digitar('0')} disabled={isPending}>
            0
          </TeclaNumerica>
          <TeclaNumerica onClick={apagar} disabled={isPending} aria-label="Apagar">
            <Delete className="size-7" />
          </TeclaNumerica>
        </div>

        {erro && <Erro>{erro}</Erro>}

        {/* A MÁQUINA LIBERA AQUI, e ele precisa saber pra onde a OP vai — no
            toque seguinte ela some do cartão. */}
        <p className="text-muted-foreground text-center text-sm">
          A máquina {maquinaCodigo} fica livre e a OP vai pra
          &ldquo;Terminadas&rdquo;, esperando o gerente.
        </p>

        <Button
          className="h-16 text-xl"
          loading={isPending}
          disabled={isPending}
          onClick={() => exigirIdentidade(concluir)}
        >
          Concluir com {produzida} {produzida === 1 ? 'peça boa' : 'peças boas'}
        </Button>
        <Button
          variant="ghost"
          className="h-12"
          onClick={onClose}
          disabled={isPending}
        >
          Voltar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function CampoNumero({
  rotulo,
  valor,
  ativo,
  onSelecionar,
}: {
  rotulo: string
  valor: string
  ativo: boolean
  onSelecionar: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelecionar}
      aria-pressed={ativo}
      className={cn(
        'focus-visible:ring-ring rounded-xl border-2 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none',
        ativo ? 'border-primary ring-primary/30 ring-4' : 'border-input',
      )}
    >
      <span className="text-muted-foreground block text-sm tracking-wide uppercase">
        {rotulo}
      </span>
      <span className="block text-4xl font-semibold tabular-nums">
        {valor === '' ? '0' : valor}
      </span>
    </button>
  )
}

// 64px de lado, com foco visível: o tablet da estação pode ter teclado
// acoplado, e quem navega por Tab precisa ver onde está.

// Erro de action, sempre DENTRO do diálogo e em tipo grande — nunca num
// toast atrás dele.
function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border-2 p-3 text-center text-lg font-medium"
    >
      {children}
    </p>
  )
}

// Hora sem data: a lista é das últimas conclusões, todas de hoje na prática.
// "14:32" é o que ele compara com a memória dele; "10/09/2026 14:32" é ruído
// que empurra o número importante pra fora da linha.
function hora(d: Date): string {
  return new Date(d).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// DESFAZER, COM CONFIRMAÇÃO. Voltar a OP pra máquina é ação com consequência
// física — alguém pode estar prestes a montar outra coisa ali —, e o botão
// fica numa lista onde o dedo passa rolando. A pergunta espera.
//
// O botão só aparece quando as TRÊS guardas da action já passam (OP ainda em
// pronto_envio, máquina livre, e quem concluiu é quem está logado). Quem
// recusa de verdade continua sendo o servidor: entre o render e o toque, o
// mundo pode ter andado — e a pessoa, trocado.
// -----------------------------------------------------------------
// "Peguei errado" — devolver a OP à fila
// -----------------------------------------------------------------

// "0167", e não "OP-2026-0167": é o número que ele fala em voz alta.
function numeroCurto(numero: string): string {
  return numero.split('-').pop() || numero
}

// A CONFIRMAÇÃO É OBRIGATÓRIA, e diz as duas consequências numa frase: a OP
// sai da máquina e a máquina fica livre. Nada de produção é apagado — no
// fluxo do tablet não há apontamento antes do Concluir —, mas a máquina muda
// de estado na frente de todo mundo, e isso pede o "sim".
//
// Quem pode, e o que volta a vazio, é do servidor
// (`devolverOpParaFilaAction`): a mesma regra de quem conclui.
function DevolverDialog({
  op,
  maquinaCodigo,
  onClose,
}: {
  op: OpNaMaquina
  maquinaCodigo: string
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const { exigirIdentidade, travarEPerguntar } = useTravaDoTablet()

  function devolver() {
    setErro(null)
    startTransition(async () => {
      marcarEco(op.id)
      const r = await devolverOpParaFilaAction(op.id)
      if (!r.success && r.error === ERRO_TABLET_TRAVADO) {
        travarEPerguntar(devolver)
        return
      }
      if (!r.success) {
        // No diálogo, em tipo grande: num toast ele sumiria atrás do diálogo.
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'OP devolvida à fila')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Devolver a OP {numeroCurto(op.numero)} pra fila?
          </DialogTitle>
          <DialogDescription className="text-base">
            A máquina {maquinaCodigo} fica livre.
          </DialogDescription>
        </DialogHeader>

        <p className="text-lg">
          <LinhaDaPeca op={op} comQuantidade />
        </p>

        {erro && <Erro>{erro}</Erro>}

        <Button
          variant="destructive"
          className="h-14 text-lg"
          loading={isPending}
          disabled={isPending}
          onClick={() => exigirIdentidade(devolver)}
        >
          Sim, devolver pra fila
        </Button>
        <Button
          variant="ghost"
          className="h-12"
          onClick={onClose}
          disabled={isPending}
        >
          Voltar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function BotaoDesfazer({
  op,
  onFeito,
}: {
  op: OpDaConsulta
  onFeito: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const { exigirIdentidade, travarEPerguntar } = useTravaDoTablet()

  function desfazer() {
    setErro(null)
    startTransition(async () => {
      marcarEco(op.id)
      const r = await desfazerConclusaoAction(op.id)
      if (!r.success && r.error === ERRO_TABLET_TRAVADO) {
        travarEPerguntar(desfazer)
        return
      }
      if (!r.success) {
        setErro(r.error)
        // A LISTA PODE ESTAR VELHA. Ela foi carregada por quem estava logado
        // quando abriu, e o "Quem é você?" pode ter trocado a pessoa no meio
        // — ou a máquina foi ocupada. Recarregar tira o botão que o servidor
        // acabou de recusar, em vez de deixá-lo lá convidando outro toque.
        toast.error(r.error)
        onFeito()
        return
      }
      toast.success(r.message ?? 'Conclusão desfeita', { duration: 8000 })
      setConfirmando(false)
      onFeito()
    })
  }

  if (!confirmando) {
    return (
      <>
        <Button
          variant="outline"
          className="mt-2 h-11 w-full text-base"
          onClick={() => setConfirmando(true)}
        >
          Desfazer conclusão
        </Button>
        {erro && (
          <p className="text-destructive mt-2 text-base font-medium">{erro}</p>
        )}
      </>
    )
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 mt-2 space-y-2 rounded-lg border-2 p-3">
      <p className="text-base font-medium">
        A OP volta pra máquina {op.maquinaCodigo} e o registro de{' '}
        {op.produzido} peças é cancelado.
      </p>
      {erro && <p className="text-destructive text-base font-medium">{erro}</p>}
      <div className="flex gap-2">
        <Button
          variant="destructive"
          className="h-12 flex-1 text-base"
          loading={isPending}
          disabled={isPending}
          onClick={() => exigirIdentidade(desfazer)}
        >
          Sim, desfazer
        </Button>
        <Button
          variant="ghost"
          className="h-12 flex-1 text-base"
          onClick={() => setConfirmando(false)}
          disabled={isPending}
        >
          Não
        </Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------
// Parada, na estação
// -----------------------------------------------------------------

// O DIÁLOGO DA /fabrica, com o que muda pro tablet: os cinco motivos do
// operador, a frase que diz QUANDO registrar, tamanho de quem está de pé e a
// trava. É o mesmo componente (src/components/maquinas/parada-dialog.tsx) —
// uma cópia aqui era o começo de duas maneiras de registrar a mesma parada.
function ParadaDoOperador({
  maquina,
  modo,
  onClose,
}: {
  maquina: MaquinaDaEstacao
  modo: 'abrir' | 'fechar'
  onClose: () => void
}) {
  const { travarEPerguntar } = useTravaDoTablet()
  return (
    <ParadaDialog
      maquina={maquina}
      modo={modo}
      onClose={onClose}
      motivos={OPCOES_DE_MOTIVO_DO_OPERADOR}
      // A REGRA ESCRITA: parada é o que tira ele da frente da máquina ou o
      // deixa esperando. Uma troca de rolo de um minuto não é parada — e sem
      // a frase, cada operador decidiria por conta própria o que registrar.
      descricaoAoAbrir="Registre se você vai sair da frente da máquina ou esperar alguém ou alguma coisa."
      paradaAberta={maquina.paradaAberta}
      variante="tablet"
      onTabletTravado={travarEPerguntar}
    />
  )
}

// -----------------------------------------------------------------
// A observação da OP, aberta pelo cartão
// -----------------------------------------------------------------

// MESMO QUADRO DO PASSO DE CONFIRMAR O INÍCIO, em letra grande: é o mesmo
// texto do gerente, e quem lê no cartão tem que ver o que quem iniciou viu.
function ObservacaoDialog({
  op,
  onClose,
}: {
  op: OpNaMaquina
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            <LinhaDaPeca op={op} comQuantidade />
          </DialogTitle>
          <DialogDescription className="text-base">
            <Destino texto={op.destino} /> · OP {op.numero}
          </DialogDescription>
        </DialogHeader>

        <div className="border-primary/40 bg-primary/5 rounded-lg border-2 p-3">
          <p className="text-muted-foreground text-sm font-medium">
            Observação do gerente
          </p>
          <p className="mt-1 text-lg whitespace-pre-wrap">{op.observacoes}</p>
        </div>

        <Button className="h-14 text-lg" onClick={onClose}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
