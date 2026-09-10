'use client'

import { Delete, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { KanbanCardData, MaquinaDaEstacao, OpNaMaquina } from './actions'
import {
  apontarProducaoAction,
  mudarStatusOrdemAction,
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
import { estadoDaMaquina } from '@/lib/producao/estado-maquina'
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
// de hover. Botão é verbo — "Iniciar produção", "Apontar", "Terminei" — e
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
  /** Fila: o que não é de ninguém. Fora da área principal, só consulta. */
  fila: KanbanCardData[]
  /** Saíram da máquina e esperam o gerente. Fora da área principal. */
  terminadas: KanbanCardData[]
  /** Nível do kanban permite agir? Só esconde botão — a action é que decide. */
  podeAgir: boolean
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
  fila,
  terminadas,
  podeAgir,
}: Props) {
  const router = useRouter()
  const [iniciando, setIniciando] = useState<MaquinaDaEstacao | null>(null)
  const [apontando, setApontando] = useState<OpNaMaquina | null>(null)
  const [terminando, setTerminando] = useState<{
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
          conteúdo da tela, e cada linha aqui é um cartão a menos à vista. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3">
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
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="h-11 text-base"
            onClick={() => setConsultando('fila')}
          >
            Fila ({fila.length})
          </Button>
          <Button
            variant="outline"
            className="h-11 text-base"
            onClick={() => setConsultando('terminadas')}
          >
            Terminadas ({terminadas.length})
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
              onApontar={() => m.op && setApontando(m.op)}
              onTerminar={() =>
                m.op && setTerminando({ op: m.op, maquinaCodigo: m.codigo })
              }
            />
          ))}
        </div>
      )}

      {iniciando && (
        <IniciarProducaoDialog
          maquina={iniciando}
          fila={fila}
          onClose={() => setIniciando(null)}
        />
      )}
      {apontando && (
        <ApontarDialog op={apontando} onClose={() => setApontando(null)} />
      )}
      {terminando && (
        <TerminarDialog
          op={terminando.op}
          maquinaCodigo={terminando.maquinaCodigo}
          onClose={() => setTerminando(null)}
        />
      )}
      {consultando && (
        <ConsultaDialog
          titulo={consultando === 'fila' ? 'Fila' : 'Terminadas'}
          descricao={
            consultando === 'fila'
              ? 'OPs esperando pra começar. Pra iniciar uma, toque em "Iniciar produção" na máquina.'
              : 'Saíram da máquina e esperam o gerente concluir.'
          }
          ordens={consultando === 'fila' ? fila : terminadas}
          vazio={
            consultando === 'fila'
              ? 'Nada na fila no momento.'
              : 'Nenhuma OP esperando o gerente.'
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
  onApontar,
  onTerminar,
}: {
  maquina: MaquinaDaEstacao
  podeAgir: boolean
  onIniciar: () => void
  onApontar: () => void
  onTerminar: () => void
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
          onApontar={onApontar}
          onTerminar={onTerminar}
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
  onApontar,
  onTerminar,
}: {
  op: OpNaMaquina
  podeAgir: boolean
  onApontar: () => void
  onTerminar: () => void
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

      {podeAgir && (
        <div className="mt-auto flex gap-2 pt-3">
          <Button className="h-12 flex-1 text-base" onClick={onApontar}>
            Apontar
          </Button>
          <Button
            variant="outline"
            className="h-12 flex-1 text-base"
            onClick={onTerminar}
          >
            Terminei
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
// depois a máquina), e é o que faz a tela seguir a estação física.
//
// ⚠️ SÓ APARECEM AS OPs QUE PODEM COMEÇAR NESTA MÁQUINA: sem responsável, e
// sem máquina ou já apontadas pra esta. O motivo é que `pegarOrdemAction` usa
// `atual.maquinaId ?? maquinaId` — uma OP já destinada à TC-05 iniciaria na
// TC-05 mesmo tocada aqui, e o operador veria a máquina continuar livre sem
// entender por quê. Elas seguem visíveis na consulta "Fila".
//
// Lista simples de propósito: busca, carregamento em partes, prioridade,
// observações e a regra de matéria-prima são a Fase 2.
function IniciarProducaoDialog({
  maquina,
  fila,
  onClose,
}: {
  maquina: MaquinaDaEstacao
  fila: KanbanCardData[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const candidatas = fila.filter(
    (o) => o.maquinaId === null || o.maquinaId === maquina.id,
  )

  function iniciar(ordemId: string) {
    setErro(null)
    startTransition(async () => {
      const r = await pegarOrdemAction(ordemId, maquina.id)
      if (!r.success) {
        // A MENSAGEM FICA NO DIÁLOGO, em tipo grande. Num toast ela
        // apareceria atrás do diálogo aberto e sumiria antes de ele ler.
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'OP em produção')
      router.refresh()
      onClose()
    })
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

        {candidatas.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-lg">
            Nenhuma OP disponível pra esta máquina. Fale com o gerente.
          </p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {candidatas.map((op) => (
              <button
                key={op.id}
                type="button"
                disabled={isPending}
                onClick={() => iniciar(op.id)}
                className="hover:border-primary hover:bg-primary/5 focus-visible:ring-ring w-full rounded-xl border-2 p-3 text-left focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
              >
                <div className="text-xl font-semibold">{op.produtoNome}</div>
                {variacaoDe(op) && (
                  <div className="text-lg">{variacaoDe(op)}</div>
                )}
                <div className="text-muted-foreground text-sm tabular-nums">
                  {op.numero} · {op.quantidade} peças
                </div>
              </button>
            ))}
          </div>
        )}

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

// -----------------------------------------------------------------
// Consulta: fila e terminadas (fora da área principal)
// -----------------------------------------------------------------

// SÓ LEITURA. A fila responde "quanto tem pra fazer" e as terminadas
// respondem "o que eu já entreguei" — nenhuma das duas age. Quem inicia é o
// cartão da máquina, que é onde a decisão tem contexto.
function ConsultaDialog({
  titulo,
  descricao,
  ordens,
  vazio,
  onClose,
}: {
  titulo: string
  descricao: string
  ordens: KanbanCardData[]
  vazio: string
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {titulo} ({ordens.length})
          </DialogTitle>
          <DialogDescription className="text-base">
            {descricao}
          </DialogDescription>
        </DialogHeader>

        {ordens.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-lg">
            {vazio}
          </p>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {ordens.map((op) => (
              <div key={op.id} className="rounded-xl border p-3">
                <div className="text-lg font-semibold">{op.produtoNome}</div>
                {variacaoDe(op) && (
                  <div className="text-base">{variacaoDe(op)}</div>
                )}
                <div className="text-muted-foreground text-sm tabular-nums">
                  {op.numero} · {op.quantidade} peças
                  {op.maquinaCodigo && ` · ${op.maquinaCodigo}`}
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="ghost" className="h-14 text-lg" onClick={onClose}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Apontar produção
// -----------------------------------------------------------------

type Campo = 'produzida' | 'refugo'

function ApontarDialog({
  op,
  onClose,
}: {
  op: OpNaMaquina
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [ativo, setAtivo] = useState<Campo>('produzida')
  const [valores, setValores] = useState<Record<Campo, string>>({
    produzida: '',
    refugo: '',
  })
  const [erro, setErro] = useState<string | null>(null)

  const faltam = Math.max(0, op.quantidade - op.produzido)

  // TECLADO PRÓPRIO NA TELA, e não o do tablet: o teclado do sistema cobre
  // metade da tela, some sozinho e às vezes nem abre quando há teclado
  // físico acoplado. Aqui a tecla é sempre a mesma, sempre no mesmo lugar.
  function digitar(d: string) {
    setErro(null)
    setValores((v) => {
      const atual = v[ativo]
      // 4 dígitos é mais do que qualquer OP real, e trava o zero à esquerda
      // infinito de quem apoia o dedo na tecla.
      if (atual.length >= 4) return v
      const novo = (atual + d).replace(/^0+(?=\d)/, '')
      return { ...v, [ativo]: novo }
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

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await apontarProducaoAction(op.id, {
        produzida: valores.produzida === '' ? 0 : valores.produzida,
        refugo: valores.refugo === '' ? 0 : valores.refugo,
      })
      if (!r.success) {
        // A MENSAGEM FICA NO DIÁLOGO, em tipo grande. A validação que recusa
        // apontamento zerado já existe no Zod; num toast, ela apareceria
        // atrás do diálogo aberto e sumiria antes de ele ler.
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'Apontamento registrado')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{op.produtoNome}</DialogTitle>
          <DialogDescription className="text-base">
            {variacaoDe(op) && `${variacaoDe(op)} · `}
            faltam {faltam}
          </DialogDescription>
        </DialogHeader>

        {/* Dois campos, um ativo por vez. O destaque é BORDA GROSSA + anel,
            não só cor: no galpão a tela leva sol de lado, e diferença de
            matiz some. */}
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            rotulo="Prontas"
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
            <Tecla key={d} onClick={() => digitar(d)} disabled={isPending}>
              {d}
            </Tecla>
          ))}
          <Tecla onClick={limpar} disabled={isPending} aria-label="Limpar">
            C
          </Tecla>
          <Tecla onClick={() => digitar('0')} disabled={isPending}>
            0
          </Tecla>
          <Tecla onClick={apagar} disabled={isPending} aria-label="Apagar">
            <Delete className="size-7" />
          </Tecla>
        </div>

        {erro && <Erro>{erro}</Erro>}

        <Button
          className="h-16 text-xl"
          loading={isPending}
          disabled={isPending}
          onClick={salvar}
        >
          Salvar
        </Button>
        <Button
          variant="ghost"
          className="h-12"
          onClick={onClose}
          disabled={isPending}
        >
          Cancelar
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
function Tecla({
  children,
  onClick,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="bg-muted hover:bg-muted/70 focus-visible:ring-ring active:bg-muted/50 flex h-16 items-center justify-center rounded-xl text-2xl font-semibold disabled:opacity-50 focus-visible:ring-4 focus-visible:outline-none"
    >
      {children}
    </button>
  )
}

// -----------------------------------------------------------------
// Terminei
// -----------------------------------------------------------------

// CONFIRMAÇÃO, e não o toast-com-desfazer do kanban. Toque acidental no
// tablet é comum — a mão encosta na tela ao apoiar —, e desfazer exige ler
// rápido uma tarja que some. Aqui a pergunta espera.
function TerminarDialog({
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

  function confirmar() {
    setErro(null)
    startTransition(async () => {
      const r = await mudarStatusOrdemAction(op.id, { status: 'pronto_envio' })
      if (!r.success) {
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'OP pronta pro envio')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Terminou a OP {op.numero}?
          </DialogTitle>
          {/* ONDE ELA VAI PARAR. A OP sai da máquina e some do cartão — sem
              esta frase ele não saberia onde procurar depois. */}
          <DialogDescription className="text-lg">
            A máquina {maquinaCodigo} fica livre e a OP vai pra
            &ldquo;Terminadas&rdquo;, esperando o gerente concluir.
          </DialogDescription>
        </DialogHeader>

        {erro && <Erro>{erro}</Erro>}

        <Button
          className="h-16 text-xl"
          loading={isPending}
          disabled={isPending}
          onClick={confirmar}
        >
          Sim, terminei
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
