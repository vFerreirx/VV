'use client'

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Cog,
  Folder,
  PackageOpen,
  Plus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { KanbanCardData } from './actions'
import {
  ConcluirProducaoDialog,
  IniciarNaMaquinaDialog,
} from './dialogos-do-gerente'
import { OpDetailSheet } from './op-detail-sheet'
import type { ProdutoComVariacoesParaForm } from '@/app/(app)/ordens/actions'
import { NovaOpDialog } from '@/components/ordens/nova-op-dialog'
import { Button } from '@/components/ui/button'
import {
  desfazerConclusaoAction,
  iniciarProducaoAction,
  mudarStatusOrdemAction,
} from '@/app/(app)/ordens/actions'
import { Badge } from '@/components/ui/badge'
import { PRIORIDADE_BADGE } from '@/lib/prioridade'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  ehStatusKanban,
  indiceNoKanban,
  PRIORIDADE_LABEL,
  STATUS_KANBAN,
  STATUS_LABEL_CURTO,
  statusValues,
  type StatusKanban,
} from '@/lib/validators/ordens'

// -----------------------------------------------------------------
// Estilos por status (header e borda da coluna)
// -----------------------------------------------------------------

// Indexado por StatusKanban (não pela união das 8): assim o TypeScript cobra
// estilo pra toda coluna do board e recusa estilo de coluna que não existe
// mais. Foi isso que apagou acabamento/embalagem daqui.
export const COLUMN_STYLES: Record<
  StatusKanban,
  { header: string; bar: string }
> = {
  aguardando_materia_prima: {
    header: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
    bar: 'bg-zinc-500',
  },
  programado: {
    header: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    bar: 'bg-blue-500',
  },
  em_producao: {
    header: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
  },
  pronto_envio: {
    header: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
}

// OCUPAÇÃO NO CABEÇALHO DE "EM PRODUÇÃO", NO LUGAR DO LIMITE DE WIP.
//
// O limite era 48, calculado quando a OP ficava em `em_producao` também
// durante acabamento e embalagem: 24 máquinas + 12 + 12. Hoje ela sai de
// produção quando sai da máquina, e o índice único
// `ordens_producao_maquina_em_producao_uidx` só deixa uma OP em produção por
// máquina — o 48 nunca disparava, e um contador que nunca dispara ensina a
// não olhar pra ele.
//
// O que responde "cabe mais uma?" é a máquina: "18 de 22 máquinas", as que
// estão produzindo contra as aptas. Sem alarme — é informação, não limite.
//
// ⚠️ A CONTA É A DA /fabrica, e não uma nova. `page.tsx` usa a mesma
// `listarMaquinas` e passa por `situacaoDaMaquina` + `contarMaquinas`
// (src/lib/producao/estado-maquina.ts). Com uma conta aqui e outra lá, as
// duas telas iam discordar sobre a mesma fábrica no mesmo minuto — e a
// máquina em manutenção com OP dentro é exatamente onde elas divergiriam.
export type OcupacaoDasMaquinas = { produzindo: number; aptas: number }

// A partir de quanto tempo parado na etapa o card é destacado. Ausente =
// sem destaque (o "há Xd" continua aparecendo, só sem cor).
//
// ⚠️ VAZIO DURANTE A COLETA. Chute de limiar é pior que limiar nenhum: os 3
// dias que valiam pra todas as colunas acendiam a fila por rotina e deixavam
// passar a máquina parada. A coleta começa quando os operadores entram nos
// tablets — antes disso o board é atualizado pelo gerente em paralelo com o
// Trello, e o tempo por coluna mede quando ele lembrou de arrastar, não a
// fábrica. Ela termina com 30 OPs com baixa E pelo menos 2 semanas
// completas; os limiares saem da mediana e do p90 de permanência por coluna
// no `eventos_kanban`.
//
// Continua EM ABERTO se vão ser dias por coluna ou normalizados por
// quantidade de peças: a mesma coluna segura uma OP de 20 peças por uma
// tarde e uma de 600 por uma semana, e um limiar fixo em dias acenderia a
// grande toda vez e nunca a pequena.
//
// Na coluna Produção concluída o destaque NÃO é atraso: é pendência de baixa
// — a produção terminou e ninguém deu baixa na OP. O `title` do relógio diz
// isso nessa coluna.
const AGING_ALERTA_MS: Partial<Record<StatusKanban, number>> = {}

function tempoNaEtapa(
  desde: Date,
  status: (typeof statusValues)[number],
): { label: string; aging: boolean } {
  const ms = Date.now() - new Date(desde).getTime()
  const min = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(min / 60)
  const d = Math.floor(h / 24)
  const label = d >= 1 ? `há ${d}d` : h >= 1 ? `há ${h}h` : `há ${min}min`
  const limite = ehStatusKanban(status) ? AGING_ALERTA_MS[status] : undefined
  return { label, aging: limite !== undefined && ms >= limite }
}

type FiltroChip = 'minhas' | 'urgentes' | 'atrasadas' | 'semDono'
const FILTROS_CHIP: readonly FiltroChip[] = [
  'minhas',
  'urgentes',
  'atrasadas',
  'semDono',
]
const FILTRO_LABEL: Record<FiltroChip, string> = {
  minhas: 'Minhas',
  urgentes: 'Urgentes',
  atrasadas: 'Atrasadas',
  semDono: 'Sem dono',
}

// -----------------------------------------------------------------
// Board
// -----------------------------------------------------------------

type Props = {
  ordens: KanbanCardData[]
  podeMover: boolean
  currentUserId: string
  produtos: ProdutoComVariacoesParaForm[]
  podeCriar: boolean
  ocupacao: OcupacaoDasMaquinas
  /** Admin ou gerente: as ações de produção do sheet. */
  gestor: boolean
  /**
   * `?filtro=` da URL: o chip que já nasce ligado. É por onde o card
   * "Produção atrasada" do dashboard chega com as atrasadas filtradas.
   * Validado aqui — valor desconhecido é ignorado. Depois de aberto, os chips
   * continuam sendo estado da tela.
   */
  filtroDaUrl?: string
}

// Status que a OP pode ter no board — os das colunas.
type Status = (typeof statusValues)[number]

export function KanbanBoard({
  ordens,
  podeMover,
  currentUserId,
  produtos,
  podeCriar,
  ocupacao,
  gestor,
  filtroDaUrl,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [novaOpOpen, setNovaOpOpen] = useState(false)
  const [filtros, setFiltros] = useState<Set<FiltroChip>>(
    () =>
      new Set(
        FILTROS_CHIP.filter((f) => f === filtroDaUrl),
      ),
  )
  // O diálogo de uma das duas portas próprias, quando aberto.
  const [porta, setPorta] = useState<
    { tipo: 'maquina' | 'concluir'; ordem: KanbanCardData } | null
  >(null)

  function toggleFiltro(f: FiltroChip) {
    setFiltros((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      return next
    })
  }

  // useOptimistic: durante a transição, exibimos `items` com o status novo;
  // quando o servidor responde e router.refresh() traz `ordens` atualizadas,
  // o estado otimista é descartado automaticamente.
  const [items, setOptimisticItems] = useOptimistic(
    ordens,
    (state, update: { id: string; status: (typeof statusValues)[number] }) =>
      state.map((o) =>
        o.id === update.id ? { ...o, status: update.status } : o,
      ),
  )

  // Realtime: outros usuários alterando OPs.
  useEffect(() => {
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel('kanban-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ordens_producao',
        },
        () => {
          // Mais simples: pede ao servidor pra re-renderizar a página.
          // O useEffect acima sincroniza o estado local depois.
          router.refresh()
        },
      )
      // A OCUPAÇÃO DO CABEÇALHO também depende da máquina: pôr uma em
      // manutenção muda o "de 22" sem mexer em OP nenhuma. `maquinas` já está
      // na publicação (05_realtime.sql).
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

  const sensors = useSensors(
    // Mouse (desktop): arrasta após pequeno movimento; clicks não viram drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Toque (tablet): só arrasta com pressão longa (~0,25s parado). Deslize
    // rápido rola o board nativamente, sem mover o card por engano.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  )

  const visiveis = useMemo(() => {
    if (filtros.size === 0) return items
    return items.filter((o) => {
      if (filtros.has('minhas') && o.responsavelId !== currentUserId)
        return false
      if (filtros.has('urgentes') && o.prioridade !== 'urgente') return false
      if (filtros.has('atrasadas') && !o.atrasada) return false
      if (filtros.has('semDono') && o.responsavelId) return false
      return true
    })
  }, [items, filtros, currentUserId])

  const grupos = useMemo(() => {
    return STATUS_KANBAN.map((status) => ({
      status,
      ordens: visiveis.filter((o) => o.status === status),
    }))
  }, [visiveis])

  const activeOrdem = activeId ? items.find((o) => o.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  // O GESTO DO GERENTE: arrastar o card, ou o "›" dele. Decide QUAL porta.
  //
  // ⚠️ AS DUAS PORTAS PRÓPRIAS ABREM DIÁLOGO, E O CARD NÃO SE MEXE ANTES DE
  // CONFIRMAR. Sem update otimista: cancelar não tem o que desfazer, porque a
  // OP nunca saiu do lugar. O resto segue o caminho genérico de sempre.
  function mover(ordemId: string, novoStatus: Status) {
    const ordem = items.find((o) => o.id === ordemId)
    if (!ordem || ordem.status === novoStatus) return
    if (!ehStatusKanban(novoStatus)) return

    if (novoStatus === 'em_producao') {
      // DE VOLTA DA CONCLUSÃO pra máquina é desfazer a conclusão — com o
      // apontamento dela. Pedir máquina aqui só devolveria erro: OP com
      // produção concluída não entra em máquina de novo.
      if (ordem.status === 'pronto_envio') {
        desfazerConclusao(ordem.id)
        return
      }
      setPorta({ tipo: 'maquina', ordem })
      return
    }
    if (novoStatus === 'pronto_envio') {
      setPorta({ tipo: 'concluir', ordem })
      return
    }
    moverGenerico(ordem.id, ordem.status, novoStatus, ordem.maquinaId)
  }

  // O caminho genérico (`mudarStatusOrdemAction`), com update otimista e
  // "Desfazer". O servidor recusa as portas próprias — ver
  // src/lib/producao/transicoes-da-op.ts.
  function moverGenerico(
    ordemId: string,
    de: Status,
    para: Status,
    maquinaId: string | null,
    opts?: { semDesfazer?: boolean },
  ) {
    startTransition(async () => {
      // Optimistic update — válido durante toda a transição.
      setOptimisticItems({ id: ordemId, status: para })

      const result = await mudarStatusOrdemAction(ordemId, { status: para })
      if (!result.success) {
        // Sai da transição: o estado otimista some e a UI volta pro server state.
        toast.error(result.error)
        return
      }
      const texto = 'Movida pra ' + STATUS_LABEL_CURTO[para]
      if (opts?.semDesfazer) {
        toast.success(texto)
      } else {
        toast.success(texto, {
          duration: 6000,
          action: {
            label: 'Desfazer',
            onClick: () => desfazerMovimento(ordemId, de, maquinaId),
          },
        })
      }
      router.refresh()
    })
  }

  // ⚠️ O "DESFAZER" RECEBE A ORIGEM PRONTA, E NÃO RELÊ O CARD. O toast
  // guarda o closure do render em que o movimento começou — ali o card ainda
  // estava na coluna de ORIGEM, e reler `items` fazia "voltar pra lá" parecer
  // já feito: o desfazer saía sem fazer nada.
  function desfazerMovimento(
    ordemId: string,
    voltarPara: Status,
    maquinaId: string | null,
  ) {
    // A volta pra produção passa pela porta dela, com a máquina que a OP
    // tinha. O servidor ainda confere se ela está livre.
    if (voltarPara === 'em_producao') {
      if (!maquinaId) {
        toast.error('Essa OP não tem máquina pra voltar. Abra a OP e escolha uma.')
        return
      }
      startTransition(async () => {
        const r = await iniciarProducaoAction(ordemId, maquinaId)
        if (!r.success) {
          toast.error(r.error)
          return
        }
        toast.success(r.message ?? 'OP voltou pra produção')
        router.refresh()
      })
      return
    }
    // Pra `pronto_envio` o genérico aceita: a OP já tem o apontamento dela.
    const atual = items.find((o) => o.id === ordemId)?.status
    moverGenerico(ordemId, atual ?? voltarPara, voltarPara, maquinaId, {
      semDesfazer: true,
    })
  }

  function desfazerConclusao(ordemId: string) {
    startTransition(async () => {
      const r = await desfazerConclusaoAction(ordemId)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Conclusão desfeita')
      router.refresh()
    })
  }

  function aoIniciar(ordem: KanbanCardData, mensagem: string) {
    setPorta(null)
    // OP legada que só GANHOU máquina não mudou de coluna: não há o que
    // desfazer por aqui.
    if (ordem.status === 'em_producao') {
      toast.success(mensagem)
    } else {
      toast.success(mensagem, {
        duration: 6000,
        action: {
          label: 'Desfazer',
          onClick: () =>
            moverGenerico(ordem.id, 'em_producao', ordem.status, null, {
              semDesfazer: true,
            }),
        },
      })
    }
    router.refresh()
  }

  function aoConcluir(
    ordem: KanbanCardData,
    { mensagem, concluiu }: { mensagem: string; concluiu: boolean },
  ) {
    setPorta(null)
    // "Desfazer" só pra conclusão DE AGORA. "Já estava concluída" também é
    // sucesso, e desfazê-la apagaria o registro de outra pessoa. O desfazer
    // tira o apontamento junto e devolve a OP pra origem — a máquina, ou a
    // coluna da fila de onde o gerente concluiu.
    toast.success(
      mensagem,
      concluiu
        ? {
            duration: 8000,
            action: {
              label: 'Desfazer',
              onClick: () => desfazerConclusao(ordem.id),
            },
          }
        : undefined,
    )
    router.refresh()
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    mover(String(active.id), String(over.id) as Status)
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS_CHIP.map(
            (f) => {
              const ativo = filtros.has(f)
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFiltro(f)}
                  aria-pressed={ativo}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    ativo
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {FILTRO_LABEL[f]}
                </button>
              )
            },
          )}
          {filtros.size > 0 && (
            <button
              type="button"
              onClick={() => setFiltros(new Set())}
              className="text-muted-foreground hover:text-foreground ml-1 text-xs underline"
            >
              limpar
            </button>
          )}
        </div>
        {podeCriar && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setNovaOpOpen(true)}
          >
            <Plus />
            Nova OP
          </Button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:snap-none">
          {grupos.map((g) => (
            <KanbanColumn
              key={g.status}
              status={g.status}
              ordens={g.ordens}
              podeMover={podeMover}
              isPending={isPending}
              ocupacao={g.status === 'em_producao' ? ocupacao : null}
              onMover={mover}
              onAbrirDetalhe={(id) => setDetalheId(id)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeOrdem ? (
            <div className="rotate-1 opacity-95">
              <KanbanCardContent ordem={activeOrdem} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <OpDetailSheet
        ordemId={detalheId}
        onClose={() => setDetalheId(null)}
        gestor={gestor}
        podeMover={podeMover}
        // Cancelar e Excluir são escrita em "ordens" — a mesma que cria OP.
        podeEditarOrdens={podeCriar}
      />

      {novaOpOpen && (
        <NovaOpDialog produtos={produtos} onClose={() => setNovaOpOpen(false)} />
      )}

      {porta?.tipo === 'maquina' && (
        <IniciarNaMaquinaDialog
          ordem={porta.ordem}
          onFeito={(mensagem) => aoIniciar(porta.ordem, mensagem)}
          onClose={() => setPorta(null)}
        />
      )}
      {porta?.tipo === 'concluir' && (
        <ConcluirProducaoDialog
          ordem={porta.ordem}
          onFeito={(resultado) => aoConcluir(porta.ordem, resultado)}
          onClose={() => setPorta(null)}
        />
      )}
    </>
  )
}

// -----------------------------------------------------------------
// Coluna (droppable)
// -----------------------------------------------------------------

function KanbanColumn({
  status,
  ordens,
  podeMover,
  isPending,
  ocupacao,
  onMover,
  onAbrirDetalhe,
}: {
  status: StatusKanban
  ordens: KanbanCardData[]
  podeMover: boolean
  isPending: boolean
  /** Só na coluna "Em produção"; null nas outras. */
  ocupacao: OcupacaoDasMaquinas | null
  onMover: (id: string, status: (typeof statusValues)[number]) => void
  onAbrirDetalhe: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const styles = COLUMN_STYLES[status]

  // 1º nível: OPs de uma remessa Full viram um card do Full na coluna.
  // O restante segue o agrupamento por produto (2+ OPs -> pasta).
  const { fulls, semFull } = useMemo(() => {
    const porFull = new Map<string, KanbanCardData[]>()
    const resto: KanbanCardData[] = []
    for (const o of ordens) {
      if (o.remessaFullId) {
        const arr = porFull.get(o.remessaFullId)
        if (arr) arr.push(o)
        else porFull.set(o.remessaFullId, [o])
      } else {
        resto.push(o)
      }
    }
    return {
      fulls: [...porFull.entries()].map(([id, ops]) => ({ id, ops })),
      semFull: resto,
    }
  }, [ordens])

  const grupos = useMemo(() => agruparPorProduto(semFull), [semFull])

  return (
    <div className="flex w-[78vw] max-w-64 shrink-0 snap-start flex-col sm:w-64">
      <header
        className={cn(
          'mb-2 rounded-md px-3 py-2 text-xs font-medium',
          styles.header,
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className={cn('inline-block h-2 w-2 rounded-full', styles.bar)} />
            {STATUS_LABEL_CURTO[status]}
          </span>
          <span className="tabular-nums opacity-70">{ordens.length}</span>
        </div>
        {/* Os dois números podem divergir, e é informação: OP legada em
            produção sem máquina, ou máquina em manutenção com OP dentro. */}
        {ocupacao && (
          <div
            className="mt-0.5 text-[10px] font-normal tabular-nums opacity-80"
            title="Máquinas produzindo / máquinas aptas — a mesma conta da Fábrica"
          >
            {ocupacao.produzindo} de {ocupacao.aptas}{' '}
            {ocupacao.aptas === 1 ? 'máquina' : 'máquinas'}
          </div>
        )}
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          // Altura limitada à viewport: a pilha de OPs rola DENTRO da coluna,
          // sem esticar a página inteira.
          'max-h-[calc(100dvh-12rem)] flex-1 space-y-1.5 overflow-y-auto rounded-lg border border-dashed p-2 transition-colors',
          isOver
            ? 'border-foreground/40 bg-muted/30'
            : 'border-border bg-muted/10',
        )}
      >
        {ordens.length === 0 && !isOver && (
          <p className="text-muted-foreground py-6 text-center text-xs">
            (vazio)
          </p>
        )}
        {fulls.map((f) => (
          <PastaFull
            key={f.id}
            ops={f.ops}
            podeMover={podeMover}
            isPending={isPending}
            onMover={onMover}
            onAbrirDetalhe={onAbrirDetalhe}
          />
        ))}
        {grupos.map((g) =>
          g.ops.length >= 2 ? (
            <PastaProduto
              key={g.key}
              grupo={g}
              podeMover={podeMover}
              isPending={isPending}
              onMover={onMover}
              onAbrirDetalhe={onAbrirDetalhe}
            />
          ) : (
            <KanbanCard
              key={g.ops[0].id}
              ordem={g.ops[0]}
              podeMover={podeMover}
              isPending={isPending}
              onMover={onMover}
              onAbrirDetalhe={onAbrirDetalhe}
            />
          ),
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------
// Pasta de Full (agrupa as OPs de uma remessa na coluna) — clica e vê
// as OPs de dentro.
// -----------------------------------------------------------------

function PastaFull({
  ops,
  podeMover,
  isPending,
  onMover,
  onAbrirDetalhe,
}: {
  ops: KanbanCardData[]
  podeMover: boolean
  isPending: boolean
  onMover: (id: string, status: (typeof statusValues)[number]) => void
  onAbrirDetalhe: (id: string) => void
}) {
  const [aberta, setAberta] = useState(false)
  const totalUn = ops.reduce((s, o) => s + o.quantidade, 0)
  const nAtrasadas = ops.filter((o) => o.atrasada).length
  const label = ops[0]?.remessaLabel ?? 'Full'

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-lg p-2.5 text-left transition-colors"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <PackageOpen
            className={cn(
              'size-4 shrink-0',
              nAtrasadas > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{label}</span>
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {ops.length} OP{ops.length > 1 ? 's' : ''} · {totalUn} un
              {nAtrasadas > 0 && (
                <span className="text-destructive font-medium">
                  {' '}
                  · {nAtrasadas} atrasada{nAtrasadas > 1 ? 's' : ''}
                </span>
              )}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground size-3.5 shrink-0 transition-transform',
            aberta && 'rotate-180',
          )}
        />
      </button>

      {aberta && (
        <div className="space-y-1.5 border-t p-2">
          {ops.map((o) => (
            <KanbanCard
              key={o.id}
              ordem={o}
              podeMover={podeMover}
              isPending={isPending}
              onMover={onMover}
              onAbrirDetalhe={onAbrirDetalhe}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------
// Pasta de produto (agrupa OPs do mesmo produto) — drill tamanho → cor
// -----------------------------------------------------------------

type GrupoProduto = {
  key: string
  produtoNome: string
  produtoSku: string
  ops: KanbanCardData[]
}

// Agrupa as OPs por produto, preservando a ordem de aparição.
function agruparPorProduto(ordens: KanbanCardData[]): GrupoProduto[] {
  const map = new Map<string, KanbanCardData[]>()
  for (const o of ordens) {
    const key = o.produtoSku || o.produtoNome
    const arr = map.get(key)
    if (arr) arr.push(o)
    else map.set(key, [o])
  }
  return [...map.entries()].map(([key, ops]) => ({
    key,
    produtoNome: ops[0].produtoNome,
    produtoSku: ops[0].produtoSku,
    ops,
  }))
}

const SEM_TAMANHO = 'Sem tamanho'
const SEM_COR = 'Sem cor'
const tamDe = (o: KanbanCardData) => o.variacaoTamanho || SEM_TAMANHO
const corDe = (o: KanbanCardData) => o.variacaoCor || SEM_COR

function contar(ops: KanbanCardData[], chave: (o: KanbanCardData) => string) {
  const m = new Map<string, number>()
  for (const o of ops) m.set(chave(o), (m.get(chave(o)) ?? 0) + 1)
  return [...m.entries()].map(([nome, n]) => ({ nome, n }))
}

function PastaProduto({
  grupo,
  podeMover,
  isPending,
  onMover,
  onAbrirDetalhe,
}: {
  grupo: GrupoProduto
  podeMover: boolean
  isPending: boolean
  onMover: (id: string, status: (typeof statusValues)[number]) => void
  onAbrirDetalhe: (id: string) => void
}) {
  const [aberta, setAberta] = useState(false)
  const [tam, setTam] = useState<string | null>(null)
  const [cor, setCor] = useState<string | null>(null)

  const tamanhos = useMemo(() => contar(grupo.ops, tamDe), [grupo.ops])
  const cores = useMemo(
    () => (tam ? contar(grupo.ops.filter((o) => tamDe(o) === tam), corDe) : []),
    [grupo.ops, tam],
  )
  const opsFiltradas = useMemo(
    () =>
      tam && cor
        ? grupo.ops.filter((o) => tamDe(o) === tam && corDe(o) === cor)
        : [],
    [grupo.ops, tam, cor],
  )
  const totalUn = grupo.ops.reduce((s, o) => s + o.quantidade, 0)
  const nAtrasadas = grupo.ops.filter((o) => o.atrasada).length
  const algumAtrasada = nAtrasadas > 0

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="hover:bg-muted/40 flex w-full flex-col gap-1.5 rounded-lg p-2.5 text-left transition-colors"
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <Folder
              className={cn(
                'size-4 shrink-0',
                algumAtrasada ? 'text-destructive' : 'text-muted-foreground',
              )}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium">
                {grupo.produtoNome}
              </span>
              <span className="text-muted-foreground truncate font-mono text-[10px]">
                {grupo.produtoSku}
              </span>
            </span>
          </span>
          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
            {grupo.ops.length} OPs · {totalUn} un
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform',
                aberta && 'rotate-180',
              )}
            />
          </span>
        </span>

        {/* Resumo das variações (sempre visível, mesmo fechada) */}
        <span className="flex flex-wrap items-center gap-1 pl-[1.375rem]">
          {algumAtrasada && (
            <span className="bg-destructive/10 text-destructive inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
              <CircleAlert className="size-2.5" />
              {nAtrasadas} atrasada{nAtrasadas > 1 ? 's' : ''}
            </span>
          )}
          {tamanhos.map((t) => (
            <span
              key={t.nome}
              className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]"
            >
              {t.nome} <span className="opacity-60">{t.n}</span>
            </span>
          ))}
        </span>
      </button>

      {aberta && (
        <div className="space-y-2 border-t p-2">
          <div>
            <div className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
              Tamanho
            </div>
            <div className="flex flex-wrap gap-1">
              {tamanhos.map((t) => (
                <button
                  key={t.nome}
                  type="button"
                  onClick={() => {
                    setTam(t.nome)
                    setCor(null)
                  }}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                    tam === t.nome
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  {t.nome} <span className="opacity-70">({t.n})</span>
                </button>
              ))}
            </div>
          </div>

          {tam && (
            <div>
              <div className="text-muted-foreground mb-1 text-[10px] tracking-wide uppercase">
                Cor
              </div>
              <div className="flex flex-wrap gap-1">
                {cores.map((c) => (
                  <button
                    key={c.nome}
                    type="button"
                    onClick={() => setCor(c.nome)}
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                      cor === c.nome
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-muted',
                    )}
                  >
                    {c.nome} <span className="opacity-70">({c.n})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tam && cor && (
            <div className="space-y-1.5 pt-0.5">
              {opsFiltradas.map((o) => (
                <KanbanCard
                  key={o.id}
                  ordem={o}
                  podeMover={podeMover}
                  isPending={isPending}
                  onMover={onMover}
                  onAbrirDetalhe={onAbrirDetalhe}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------
// Card (draggable)
// -----------------------------------------------------------------

function KanbanCard({
  ordem,
  podeMover,
  isPending,
  onMover,
  onAbrirDetalhe,
}: {
  ordem: KanbanCardData
  podeMover: boolean
  isPending: boolean
  onMover: (id: string, status: (typeof statusValues)[number]) => void
  onAbrirDetalhe: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ordem.id,
    disabled: !podeMover || isPending,
  })

  // Quando arrastando, escondemos o card original (DragOverlay mostra a cópia).
  return (
    <div
      ref={setNodeRef}
      {...(podeMover ? attributes : {})}
      {...(podeMover ? listeners : {})}
      onClick={() => {
        if (!isDragging) onAbrirDetalhe(ordem.id)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAbrirDetalhe(ordem.id)
        }
      }}
      className={cn(
        'cursor-pointer select-none',
        isDragging && 'opacity-30',
      )}
    >
      <KanbanCardContent
        ordem={ordem}
        podeMoverEsta={podeMover}
        onMover={onMover}
      />
    </div>
  )
}

// Conteúdo visual do card (reutilizado pelo DragOverlay). Compacto.
function KanbanCardContent({
  ordem,
  dragging,
  podeMoverEsta,
  onMover,
}: {
  ordem: KanbanCardData
  dragging?: boolean
  podeMoverEsta?: boolean
  onMover?: (id: string, status: (typeof statusValues)[number]) => void
}) {
  // Sem transição registrada não há relógio — ver `desdeStatus` em
  // producao/actions.ts. Mostrar "há 0min" seria afirmar uma entrada que
  // ninguém sabe quando foi.
  const tempo = ordem.desdeStatus
    ? tempoNaEtapa(ordem.desdeStatus, ordem.status)
    : null
  const idx = indiceNoKanban(ordem.status)
  const proximo =
    idx >= 0 && idx < STATUS_KANBAN.length - 1 ? STATUS_KANBAN[idx + 1] : null
  const variacao = [ordem.variacaoCor, ordem.variacaoTamanho]
    .filter(Boolean)
    .join('/')
  const destaque =
    ordem.prioridade === 'alta' || ordem.prioridade === 'urgente'
  // Barra de progresso só faz sentido a partir de em_producao — antes disso
  // a produção nem começou.
  const emEtapaProdutiva =
    indiceNoKanban(ordem.status) >= indiceNoKanban('em_producao')
  const pctProduzido =
    ordem.quantidade > 0
      ? Math.min(100, Math.round((ordem.produzido / ordem.quantidade) * 100))
      : 0

  return (
    <article
      style={
        ordem.estacaoCor
          ? { borderLeftColor: ordem.estacaoCor, borderLeftWidth: 3 }
          : undefined
      }
      className={cn(
        'bg-card rounded-md border p-2 text-xs shadow-sm transition-shadow',
        dragging ? 'shadow-lg ring-1 ring-foreground/20' : 'hover:shadow-md',
      )}
    >
      {/* Linha 1: nome do produto (inteiro) + SKU + (prioridade alta) + avançar */}
      <div className="flex items-start gap-1.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium leading-snug">
            {ordem.produtoNome}
          </span>
          <span className="text-muted-foreground truncate font-mono text-[10px]">
            {ordem.produtoSku}
          </span>
        </span>
        {destaque && (
          <Badge
            className={cn(
              'mt-0.5 h-4 shrink-0 px-1 text-[9px]',
              PRIORIDADE_BADGE[ordem.prioridade],
              ordem.prioridade === 'urgente' && 'pulse-urgente',
            )}
          >
            {PRIORIDADE_LABEL[ordem.prioridade]}
          </Badge>
        )}
        {onMover && podeMoverEsta && proximo && (
          <button
            type="button"
            title={`Avançar p/ ${STATUS_LABEL_CURTO[proximo]}`}
            onClick={(e) => {
              e.stopPropagation()
              onMover(ordem.id, proximo)
            }}
            className="text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors"
          >
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>

      {/* Linha 2: dados da OP */}
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
        <span className="tabular-nums">
          {ordem.quantidade.toLocaleString('pt-BR')} un
        </span>
        {variacao && <span className="truncate">{variacao}</span>}
        {ordem.maquinaCodigo && (
          <span
            className="inline-flex items-center gap-0.5"
            title={ordem.maquinaNome ?? undefined}
          >
            <Cog className="size-2.5" />
            {ordem.maquinaCodigo}
          </span>
        )}
        {ordem.dataPrevistaFim && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 tabular-nums',
              ordem.atrasada && 'text-destructive font-medium',
            )}
          >
            {ordem.atrasada && <CircleAlert className="size-2.5" />}
            {format(new Date(ordem.dataPrevistaFim), 'dd/MM', { locale: ptBR })}
          </span>
        )}
      </div>

      {/* Linha 3: execução — estação, tempo na etapa, responsável */}
      <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
        {ordem.estacaoNome && (
          <span className="inline-flex items-center gap-1 truncate">
            {ordem.estacaoCor && (
              <span
                className="inline-block size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: ordem.estacaoCor }}
              />
            )}
            <span className="truncate">{ordem.estacaoNome}</span>
          </span>
        )}
        {tempo && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5',
              // ⚠️ ÂMBAR, NUNCA `text-destructive`. O vermelho é de `atrasada`
              // (a data prevista, na linha de cima do mesmo card), e os dois
              // no mesmo tom faziam "passou do prazo" e "está parada há muito
              // tempo" parecerem a mesma coisa. Mesmo tom do "Em risco" das
              // remessas (remessas-view.tsx).
              tempo.aging && 'font-medium text-amber-600 dark:text-amber-400',
            )}
            title={
              ordem.status === 'pronto_envio'
                ? 'Tempo desde a conclusão da produção. Em destaque: falta dar baixa.'
                : 'Tempo nesta etapa'
            }
          >
            <Clock className="size-2.5" />
            {tempo.label}
          </span>
        )}
        {ordem.responsavelNome && (
          <span className="truncate">{ordem.responsavelNome.split(' ')[0]}</span>
        )}
      </div>

      {/* Linha 4: progresso — só a partir de em_producao */}
      {emEtapaProdutiva && (
        <div className="mt-1 flex items-center gap-1.5">
          <div
            className="bg-muted h-1 flex-1 overflow-hidden rounded-full"
            title={`Produzido ${ordem.produzido}/${ordem.quantidade}`}
          >
            {ordem.produzido > 0 && (
              <div
                className={cn(
                  'h-full rounded-full',
                  ordem.produzido >= ordem.quantidade
                    ? 'bg-emerald-500'
                    : 'bg-primary',
                )}
                style={{ width: `${pctProduzido}%` }}
              />
            )}
          </div>
          <span className="text-muted-foreground shrink-0 text-[9px] tabular-nums">
            {pctProduzido}%
          </span>
        </div>
      )}

    </article>
  )
}
