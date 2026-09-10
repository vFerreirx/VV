'use client'

import { Delete, Search, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  listarOpsDaEstacao,
  listarOpsParaIniciar,
  type ContagensDaEstacao,
  type MaquinaDaEstacao,
  type OpDaConsulta,
  type OpNaMaquina,
  type OpParaIniciar,
  type PaginaDaConsulta,
  type PaginaDeOps,
} from './actions'
import {
  concluirProducaoAction,
  pegarOrdemAction,
} from '@/app/(app)/ordens/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TeclaNumerica } from '@/components/ui/tecla-numerica'
import {
  ehDestaque,
  PRIORIDADE_BADGE,
  PRIORIDADE_LABEL,
  type PrioridadeNivel,
} from '@/lib/prioridade'
import {
  calcularConclusao,
  erroDeQuantidade,
} from '@/lib/producao/conclusao'
import { estadoDaMaquina } from '@/lib/producao/estado-maquina'
import { confirmacaoAntesDeIniciar } from '@/lib/producao/inicio-da-op'
import {
  RelogioDeInatividade,
  TrocarOperadorBotao,
} from './troca-operador'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { STATUS_LABEL } from '@/lib/validators/maquinas'

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
// feito. "Em produção · Meta: 20 peças" diz o que ele precisa saber e não
// mente enquanto o trabalho corre.
//
// O QUE ESTA TELA NÃO TEM, e a ausência é o desenho: arrastar, colunas,
// filtros, chips, agrupamento, histórico, ícone sem rótulo, nada que dependa
// de hover. Botão é verbo — "Iniciar produção", "Concluir produção" — e
// nunca um ícone sozinho: no cartão estreito de duas colunas o rótulo
// encurta, mas não vira desenho pra adivinhar.
//
// ─────────────────────────────────────────────────────────────────────────
// MEDIDAS — CALIBRADAS NO TABLET DA ESTAÇÃO, NÃO NO MONITOR
// ─────────────────────────────────────────────────────────────────────────
//
// A primeira versão desta tela usava 56px de alvo e 18px de texto no cartão,
// e no tablet de verdade ficou grande demais: cada cartão ocupava meia tela,
// e ver a estação inteira exigia rolar. Numa tela de nove máquinas, ROLAR
// custa mais do que ler letra menor — o operador perde a visão do conjunto,
// que é a única coisa que esta tela existe pra dar.
//
// O que ficou:
//   - alvo de toque no cartão: 48px (`h-12`). É o piso das diretrizes de
//     toque (44-48px) e continua confortável com o dedo sujo de fiapo;
//   - grade de DUAS colunas já no tablet (`sm:`), três no monitor do
//     gerente. É o que corta a altura pela metade sem encolher nada;
//   - o produto continua sendo o maior texto do cartão (`text-lg`), porque é
//     o que ele reconhece de longe — só deixou de ser gigante.
//
// ⚠️ O QUE **NÃO** ENCOLHEU, de propósito: a tecla do teclado numérico
// (64px, `h-16`) e os botões de confirmar dos diálogos. Ali o dedo digita
// número e confirma ação irreversível, com a mão em movimento — é o lugar
// onde errar o alvo custa caro, e não há nada em volta competindo por
// espaço. Cartão é leitura; diálogo é digitação.
//
// ⚠️ ISTO É SÓ UI. Nenhuma regra vive aqui: quem decide o que o operador
// pode é `operadorPodeAgirNaOrdem` / `condicaoDeVisaoDoOperador`
// (src/lib/db/estacao-operadores.ts) e as guardas das actions. A tela só
// evita oferecer o clique que já seria recusado, e mostra a mensagem que a
// action devolveu quando erra.

type Props = {
  nomeOperador: string
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
}

/** O que ele reconhece de longe, sem o nome do produto: "Terracota · King". */
function variacaoDe(op: {
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
}): string {
  return [op.variacaoCor, op.variacaoModelo, op.variacaoTamanho]
    .filter(Boolean)
    .join(' · ')
}

export function PainelOperador({
  nomeOperador,
  estacaoNome,
  maquinas,
  contagens,
  podeAgir,
  temPin,
}: Props) {
  const router = useRouter()
  const [iniciando, setIniciando] = useState<MaquinaDaEstacao | null>(null)
  const [concluindo, setConcluindo] = useState<{
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
  useEffect(() => {
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel('painel-operador-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordens_producao' },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maquinas' },
        () => router.refresh(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

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
          <span className="text-muted-foreground font-normal"> · </span>
          <span className="text-muted-foreground font-normal">
            {estacaoNome}
          </span>
        </h1>
        <p className="text-muted-foreground text-base tabular-nums">
          {ocupadas}/{maquinas.length} produzindo
        </p>

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
            Fila ({contagens.fila})
          </Button>
          <Button
            variant="outline"
            className="h-11 text-base"
            onClick={() => setConsultando('terminadas')}
          >
            Terminadas ({contagens.terminadas})
          </Button>
        </div>
      </div>

      {maquinas.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-base">
          Nenhuma máquina vinculada à sua estação. Fale com o admin.
        </p>
      ) : (
        // DUAS COLUNAS JÁ NO TABLET. É o que corta a altura da grade pela
        // metade sem encolher texto nenhum — ver MEDIDAS no topo.
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {maquinas.map((m) => (
            <CartaoMaquina
              key={m.id}
              maquina={m}
              podeAgir={podeAgir}
              onIniciar={() => setIniciando(m)}
              onConcluir={() =>
                m.op && setConcluindo({ op: m.op, maquinaCodigo: m.codigo })
              }
            />
          ))}
        </div>
      )}

      {iniciando && (
        <IniciarProducaoDialog
          maquina={iniciando}
          onClose={() => setIniciando(null)}
        />
      )}
      <RelogioDeInatividade />

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
            consultando === 'fila' ? contagens.fila : contagens.terminadas
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
}: {
  maquina: MaquinaDaEstacao
  podeAgir: boolean
  onIniciar: () => void
  onConcluir: () => void
}) {
  const estado = estadoDaMaquina(m.status, m.op !== null)

  return (
    <div
      className={cn(
        'flex min-h-32 flex-col rounded-xl border-2 p-3',
        estado === 'ocupada' && 'border-primary/40',
        estado === 'indisponivel' && 'bg-muted/40 border-dashed opacity-70',
      )}
    >
      {/* O CÓDIGO DA MÁQUINA NO TOPO, sempre — é por ele que ele acha o
          cartão da máquina em que está de pé. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold tabular-nums">
          {m.codigo}
        </span>
        {estado === 'indisponivel' && (
          <span className="text-muted-foreground text-sm">
            {STATUS_LABEL[m.status]}
          </span>
        )}
      </div>

      {estado === 'ocupada' && m.op && (
        <CorpoOcupada
          op={m.op}
          podeAgir={podeAgir}
          onConcluir={onConcluir}
        />
      )}

      {estado === 'livre' && (
        <div className="flex flex-1 flex-col justify-center gap-2 pt-2">
          <p className="text-muted-foreground text-center text-sm">
            Máquina livre
          </p>
          {podeAgir && (
            <Button className="h-12 w-full text-base" onClick={onIniciar}>
              Iniciar produção
            </Button>
          )}
        </div>
      )}

      {/* INDISPONÍVEL NÃO OFERECE BOTÃO NENHUM. A máquina não pode receber
          OP, e um botão que só devolve erro é pior do que nenhum botão. */}
      {estado === 'indisponivel' && (
        <div className="flex flex-1 items-center justify-center pt-2">
          <p className="text-muted-foreground text-center text-sm">
            Máquina indisponível
          </p>
        </div>
      )}
    </div>
  )
}

function CorpoOcupada({
  op,
  podeAgir,
  onConcluir,
}: {
  op: OpNaMaquina
  podeAgir: boolean
  onConcluir: () => void
}) {
  return (
    <>
      {/* O que ele reconhece de longe vem primeiro e maior. O número da OP é
          identificação, não conteúdo — vem depois e menor. */}
      <div className="mt-1.5 text-lg leading-tight font-semibold">
        {op.produtoNome}
      </div>
      {variacaoDe(op) && (
        <div className="mt-0.5 text-base">{variacaoDe(op)}</div>
      )}

      {/* META, NÃO PROGRESSO. Ver o cabeçalho do arquivo: o registro é feito
          só no fim, então uma barra ficaria zerada o turno inteiro. */}
      <p className="mt-2 text-base">
        Em produção ·{' '}
        <span className="font-semibold tabular-nums">
          Meta: {op.quantidade} peças
        </span>
      </p>
      {/* OP LEGADA, com apontamento já feito. Não some com o número dele só
          porque a barra saiu — mas fica discreto, fora do caminho. */}
      {(op.produzido > 0 || op.refugo > 0) && (
        <p className="text-muted-foreground text-sm tabular-nums">
          já registradas: {op.produzido}
          {op.refugo > 0 && ` · ${op.refugo} refugo`}
        </p>
      )}

      <div className="text-muted-foreground mt-0.5 text-xs">
        {op.numero}
        {/* QUEM ESTÁ COM ELA, quando não é quem olha. A OP do colega não
            ganha lista à parte: ela já está no cartão da máquina dele, e
            agir nela continua permitido de propósito — o turno acaba com a
            OP no meio e o colega precisa conseguir terminar
            (`operadorPodeAgirNaOrdem`). */}
        {op.responsavelNome && ` · com ${op.responsavelNome}`}
      </div>

      {/* UM BOTÃO SÓ, e não é economia de espaço.
          Eram dois — "Apontar" e "Terminei" —, cada um numa action e numa
          transação. Com os dois, o operador conseguia criar sem querer dois
          estados que a tela dele não desfaz: apontou e a tela caiu antes de
          terminar (número gravado, máquina ainda ocupada), ou terminou sem
          apontar (máquina livre, número que nunca existiu). Com um, o gesto
          é o do mundo físico: acabou, registra e sai da máquina. */}
      {podeAgir && (
        <div className="mt-auto pt-3">
          <Button className="h-12 w-full text-base" onClick={onConcluir}>
            Concluir produção
          </Button>
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
  const [pagina, setPagina] = useState<PaginaDeOps | null>(null)
  const [ops, setOps] = useState<OpParaIniciar[]>([])
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [buscando, setBuscando] = useState(true)
  const [confirmando, setConfirmando] = useState<OpParaIniciar | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // BUSCA COM DEBOUNCE, mesmo padrão do global-search: 200ms. Sem ele, cada
  // tecla vira uma consulta, e num tablet a digitação é lenta o bastante pra
  // isso virar dez consultas por palavra.
  //
  // Toda mudança de termo VOLTA PRA PÁGINA 1 e descarta o que estava
  // acumulado — senão o "Carregar mais" da busca anterior emendaria
  // resultados de duas buscas diferentes na mesma lista.
  //
  // `setBuscando` fica DENTRO do timeout, e não no corpo do efeito: o React
  // recusa setState sincrono ali (cascata de renders), e de quebra o
  // "Buscando..." deixa de piscar a cada tecla — ele aparece quando a busca
  // sai de verdade.
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscando(true)
      listarOpsParaIniciar(maquina.id, { q: termo, pagina: 1 })
        .then((r) => {
          setPagina(r)
          setOps(r.ops)
          setPaginaAtual(1)
        })
        .finally(() => setBuscando(false))
    }, 200)
    return () => clearTimeout(t)
  }, [termo, maquina.id])

  function carregarMais() {
    const proxima = paginaAtual + 1
    setBuscando(true)
    listarOpsParaIniciar(maquina.id, { q: termo, pagina: proxima })
      .then((r) => {
        setPagina(r)
        setOps((atuais) => [...atuais, ...r.ops])
        setPaginaAtual(proxima)
      })
      .finally(() => setBuscando(false))
  }

  // Um toque quando não há o que ler antes; passo de confirmação quando há.
  function escolher(op: OpParaIniciar) {
    setErro(null)
    if (op.observacoes || confirmacaoAntesDeIniciar(op.status)) {
      setConfirmando(op)
      return
    }
    iniciar(op, false)
  }

  function iniciar(op: OpParaIniciar, materiaPrimaConfirmada: boolean) {
    setErro(null)
    startTransition(async () => {
      const r = await pegarOrdemAction(op.id, maquina.id, {
        materiaPrimaConfirmada,
      })
      if (!r.success) {
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
        onConfirmar={() => iniciar(confirmando, true)}
        onVoltar={() => setConfirmando(null)}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Iniciar na máquina {maquina.codigo}
          </DialogTitle>
          <DialogDescription className="text-base">
            Escolha a OP que entra em produção agora.
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

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {ops.map((op) => (
            <button
              key={op.id}
              type="button"
              disabled={isPending}
              onClick={() => escolher(op)}
              className="hover:border-primary hover:bg-primary/5 focus-visible:ring-ring w-full rounded-xl border-2 p-3 text-left focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-xl font-semibold">{op.produtoNome}</div>
                <SeloDePrioridade prioridade={op.prioridade} />
              </div>
              {variacaoDe(op) && (
                <div className="text-lg">{variacaoDe(op)}</div>
              )}
              <div className="text-muted-foreground text-sm tabular-nums">
                {op.numero} · {op.quantidade} peças
              </div>
              {/* AVISOS DO QUE VEM DEPOIS. Não é o texto da observação — é o
                  aviso de que existe uma, pra ele saber que o toque vai
                  abrir uma leitura em vez de começar direto. */}
              {(op.observacoes ||
                confirmacaoAntesDeIniciar(op.status) !== null) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {confirmacaoAntesDeIniciar(op.status) !== null && (
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-sm text-amber-700 dark:text-amber-400">
                      Aguardando matéria-prima
                    </span>
                  )}
                  {op.observacoes && (
                    <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-sm">
                      Tem observação
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}

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

          {/* CARREGAMENTO EM PARTES. 20 por vez: a lista inteira num tablet
              é rolagem infinita, e o que ele procura está quase sempre no
              topo — a ordem é a mesma do kanban, urgente primeiro. */}
          {pagina?.temMais && !buscando && (
            <Button
              variant="outline"
              className="h-12 w-full text-base"
              onClick={carregarMais}
              disabled={isPending}
            >
              Carregar mais ({ops.length} de {pagina.total})
            </Button>
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
          <DialogTitle className="text-2xl">{op.produtoNome}</DialogTitle>
          {/* A MÁQUINA REAPARECE AQUI. Ele escolheu o cartão faz três toques
              e já leu uma lista inteira desde então; confirmar sem ver o
              destino é onde a OP vai parar na máquina errada. */}
          <DialogDescription className="text-base">
            {variacaoDe(op) && `${variacaoDe(op)} · `}
            {op.quantidade} peças · vai pra máquina {maquina.codigo}
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

// Selo de prioridade. Só alta e urgente ganham um — a regra é do
// `ehDestaque` em src/lib/prioridade.ts: um selo em cada linha vira ruído, e
// o ruído esconde justamente o urgente.
function SeloDePrioridade({ prioridade }: { prioridade: PrioridadeNivel }) {
  if (!ehDestaque(prioridade)) return null
  return (
    <span
      className={cn(
        'shrink-0 rounded px-2 py-0.5 text-sm font-medium',
        PRIORIDADE_BADGE[prioridade],
      )}
    >
      {PRIORIDADE_LABEL[prioridade]}
    </span>
  )
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
  const [ops, setOps] = useState<OpDaConsulta[]>([])
  const [pagina, setPagina] = useState<PaginaDaConsulta | null>(null)
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    listarOpsDaEstacao(destino, 1)
      .then((r) => {
        if (!vivo) return
        setPagina(r)
        setOps(r.ops)
      })
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [destino])

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
            <div key={op.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-lg font-semibold">{op.produtoNome}</div>
                <SeloDePrioridade prioridade={op.prioridade} />
              </div>
              {variacaoDe(op) && (
                <div className="text-base">{variacaoDe(op)}</div>
              )}
              <div className="text-muted-foreground text-sm tabular-nums">
                {op.numero} · {op.quantidade} peças
                {op.maquinaCodigo && ` · ${op.maquinaCodigo}`}
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
  const conclusao = calcularConclusao(op.quantidade, op.produzido)
  const [ativo, setAtivo] = useState<Campo>('produzida')
  const [valores, setValores] = useState<Record<Campo, string>>({
    // Já preenchido com o que falta — no fluxo novo, a meta inteira.
    produzida: String(conclusao.restante),
    refugo: '',
  })
  const [erro, setErro] = useState<string | null>(null)

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
      return { ...v, [ativo]: novoTexto }
    })
  }
  function apagar() {
    setErro(null)
    setValores((v) => ({ ...v, [ativo]: v[ativo].slice(0, -1) }))
  }
  function limpar() {
    setErro(null)
    setValores((v) => ({ ...v, [ativo]: '' }))
  }

  function concluir() {
    setErro(null)
    startTransition(async () => {
      const r = await concluirProducaoAction(op.id, { produzida, refugo })
      if (!r.success) {
        setErro(r.error)
        return
      }
      // Inclui o caso "já estava concluída" (reenvio depois de queda de
      // conexão), que a action devolve como sucesso de propósito.
      toast.success(r.message ?? 'Produção concluída')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{op.produtoNome}</DialogTitle>
          {/* MÁQUINA, OP E META na mesma linha: é o que ele confere antes de
              gravar, e some do cartão no instante seguinte. */}
          <DialogDescription className="text-base">
            {variacaoDe(op) && `${variacaoDe(op)} · `}
            {op.numero} · máquina {maquinaCodigo} · meta {op.quantidade}
          </DialogDescription>
        </DialogHeader>

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
          onClick={concluir}
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
