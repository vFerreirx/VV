'use client'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
import { CircleAlert, Hand, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { KanbanCardData } from './actions'
import { OpDetailSheet } from './op-detail-sheet'
import {
  mudarStatusOrdemAction,
  pegarOrdemAction,
  soltarOrdemAction,
} from '@/app/(app)/ordens/actions'
import { Badge } from '@/components/ui/badge'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  CANAL_LABEL_CURTO,
  PRIORIDADE_LABEL,
  STATUS_KANBAN,
  STATUS_LABEL_CURTO,
  prioridadeValues,
  statusValues,
} from '@/lib/validators/ordens'

// -----------------------------------------------------------------
// Estilos por status (header e borda da coluna)
// -----------------------------------------------------------------

const COLUMN_STYLES: Record<
  (typeof statusValues)[number],
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
  acabamento: {
    header: 'bg-cyan-600/10 text-cyan-700 dark:text-cyan-300',
    bar: 'bg-cyan-600',
  },
  embalagem: {
    header: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
  pronto_envio: {
    header: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  enviado: {
    header: 'bg-emerald-700/10 text-emerald-800 dark:text-emerald-400',
    bar: 'bg-emerald-700',
  },
  cancelado: { header: '', bar: '' }, // não usado no kanban
}

const PRIORIDADE_BADGE: Record<(typeof prioridadeValues)[number], string> = {
  baixa: 'bg-muted text-muted-foreground',
  normal: 'bg-secondary text-secondary-foreground',
  alta: 'bg-orange-500/15 text-orange-600',
  urgente: 'bg-destructive/15 text-destructive',
}

// -----------------------------------------------------------------
// Board
// -----------------------------------------------------------------

type Props = {
  ordens: KanbanCardData[]
  podeMover: boolean
  currentUserId: string
}

export function KanbanBoard({ ordens, podeMover, currentUserId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)

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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  const sensors = useSensors(
    // Pointer com pequeno limiar pra clicks não virarem drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Touch com delay curto pra distinguir de scroll/tap.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  )

  const grupos = useMemo(() => {
    return STATUS_KANBAN.map((status) => ({
      status,
      ordens: items.filter((o) => o.status === status),
    }))
  }, [items])

  const activeOrdem = activeId ? items.find((o) => o.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const ordemId = String(active.id)
    const novoStatus = String(over.id) as (typeof statusValues)[number]
    const ordem = items.find((o) => o.id === ordemId)
    if (!ordem) return
    if (ordem.status === novoStatus) return
    if (!STATUS_KANBAN.includes(novoStatus)) return

    startTransition(async () => {
      // Optimistic update — válido durante toda a transição.
      setOptimisticItems({ id: ordemId, status: novoStatus })

      const result = await mudarStatusOrdemAction(ordemId, {
        status: novoStatus,
      })
      if (!result.success) {
        // Sai da transição: o estado otimista some e a UI volta pro server state.
        toast.error(result.error)
        return
      }
      toast.success('Movida pra ' + STATUS_LABEL_CURTO[novoStatus])
      router.refresh()
    })
  }

  return (
    <>
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
              currentUserId={currentUserId}
              isPending={isPending}
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
      />
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
  currentUserId,
  isPending,
  onAbrirDetalhe,
}: {
  status: (typeof statusValues)[number]
  ordens: KanbanCardData[]
  podeMover: boolean
  currentUserId: string
  isPending: boolean
  onAbrirDetalhe: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const styles = COLUMN_STYLES[status]

  return (
    <div className="flex w-[85vw] max-w-72 shrink-0 snap-start flex-col sm:w-72">
      <header
        className={cn(
          'mb-2 flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium',
          styles.header,
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn('inline-block h-2 w-2 rounded-full', styles.bar)} />
          {STATUS_LABEL_CURTO[status]}
        </span>
        <span className="tabular-nums opacity-70">{ordens.length}</span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 rounded-lg border border-dashed p-2 transition-colors',
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
        {ordens.map((o) => (
          <KanbanCard
            key={o.id}
            ordem={o}
            podeMover={podeMover}
            currentUserId={currentUserId}
            isPending={isPending}
            onAbrirDetalhe={onAbrirDetalhe}
          />
        ))}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------
// Card (draggable)
// -----------------------------------------------------------------

function KanbanCard({
  ordem,
  podeMover,
  currentUserId,
  isPending,
  onAbrirDetalhe,
}: {
  ordem: KanbanCardData
  podeMover: boolean
  currentUserId: string
  isPending: boolean
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
        'cursor-pointer touch-none select-none',
        isDragging && 'opacity-30',
      )}
    >
      <KanbanCardContent
        ordem={ordem}
        currentUserId={currentUserId}
      />
    </div>
  )
}

// Botão "Pegar pra mim" / "Soltar" (fluxo puxado).
function PegarSoltar({
  ordem,
  currentUserId,
}: {
  ordem: KanbanCardData
  currentUserId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const semDono = !ordem.responsavelId
  const meu = ordem.responsavelId === currentUserId

  function agir(fn: typeof pegarOrdemAction) {
    startTransition(async () => {
      const result = await fn(ordem.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Pronto')
      router.refresh()
    })
  }

  // OP de outra pessoa: não mostra ação (só o nome no rodapé).
  if (!semDono && !meu) return null

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        agir(semDono ? pegarOrdemAction : soltarOrdemAction)
      }}
      disabled={isPending}
      className={cn(
        'mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium transition-colors disabled:opacity-60',
        semDono
          ? 'border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {semDono ? (
        <>
          <Hand className="size-3.5" />
          Pegar pra mim
        </>
      ) : (
        <>
          <Undo2 className="size-3.5" />
          Soltar
        </>
      )}
    </button>
  )
}

// Conteúdo visual do card (reutilizado pelo DragOverlay).
function KanbanCardContent({
  ordem,
  dragging,
  currentUserId,
}: {
  ordem: KanbanCardData
  dragging?: boolean
  currentUserId?: string
}) {
  return (
    <article
      style={
        ordem.estacaoCor
          ? { borderLeftColor: ordem.estacaoCor, borderLeftWidth: 4 }
          : undefined
      }
      title={ordem.estacaoNome ?? undefined}
      className={cn(
        'bg-card rounded-lg border p-3 text-sm shadow-sm transition-shadow',
        dragging
          ? 'shadow-lg ring-1 ring-foreground/20'
          : 'hover:shadow-md',
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground font-mono text-xs">
          {ordem.numero}
        </span>
        <Badge
          className={cn(
            'shrink-0 text-[10px]',
            PRIORIDADE_BADGE[ordem.prioridade],
            ordem.prioridade === 'urgente' && 'pulse-urgente',
          )}
        >
          {PRIORIDADE_LABEL[ordem.prioridade]}
        </Badge>
      </header>

      <div className="mt-1 line-clamp-2 font-medium leading-snug">
        {ordem.produtoNome}
      </div>

      {(ordem.variacaoCor || ordem.variacaoTamanho) && (
        <div className="text-muted-foreground mt-0.5 truncate text-xs">
          {[ordem.variacaoCor, ordem.variacaoTamanho]
            .filter(Boolean)
            .join(' / ')}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {ordem.quantidade.toLocaleString('pt-BR')} un
        </span>
        {ordem.maquinaCodigo && (
          <span className="text-muted-foreground font-mono">
            {ordem.maquinaCodigo}
          </span>
        )}
        <span className="text-muted-foreground">
          {CANAL_LABEL_CURTO[ordem.canalDestino]}
        </span>
      </div>

      <footer className="border-foreground/10 mt-2 flex items-center justify-between gap-2 border-t pt-2 text-xs">
        {ordem.dataPrevistaFim ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 tabular-nums',
              ordem.atrasada
                ? 'text-destructive font-medium'
                : 'text-muted-foreground',
            )}
          >
            {ordem.atrasada && <CircleAlert className="size-3.5" />}
            {format(new Date(ordem.dataPrevistaFim), 'dd/MM', { locale: ptBR })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {ordem.responsavelNome && (
          <span className="text-muted-foreground inline-flex items-center gap-1 truncate text-[11px]">
            {ordem.estacaoCor && (
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: ordem.estacaoCor }}
              />
            )}
            {ordem.responsavelNome.split(' ')[0]}
          </span>
        )}
      </footer>

      {currentUserId && (
        <PegarSoltar ordem={ordem} currentUserId={currentUserId} />
      )}
    </article>
  )
}
