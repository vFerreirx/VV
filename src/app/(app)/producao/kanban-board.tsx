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
  Folder,
  Hand,
  Plus,
  Undo2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { KanbanCardData } from './actions'
import { OpDetailSheet } from './op-detail-sheet'
import { QuickOrdemDialog } from './quick-ordem-dialog'
import type { ProdutoComVariacoesParaForm } from '@/app/(app)/ordens/actions'
import { Button } from '@/components/ui/button'
import {
  mudarStatusOrdemAction,
  pegarOrdemAction,
  soltarOrdemAction,
} from '@/app/(app)/ordens/actions'
import { Badge } from '@/components/ui/badge'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
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

// Limite de WIP (work-in-progress) por etapa. null = sem limite.
// Ajuste os números conforme a capacidade real de cada etapa.
const WIP_LIMITES: Partial<Record<(typeof statusValues)[number], number>> = {
  em_producao: 18,
  acabamento: 12,
  embalagem: 12,
}

// A partir de quanto tempo parado na etapa o card é destacado (3 dias).
const AGING_ALERTA_MS = 3 * 24 * 60 * 60 * 1000

function tempoNaEtapa(desde: Date): { label: string; aging: boolean } {
  const ms = Date.now() - new Date(desde).getTime()
  const min = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(min / 60)
  const d = Math.floor(h / 24)
  const label = d >= 1 ? `há ${d}d` : h >= 1 ? `há ${h}h` : `há ${min}min`
  return { label, aging: ms >= AGING_ALERTA_MS }
}

type FiltroChip = 'minhas' | 'urgentes' | 'atrasadas' | 'semDono'
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
  isOperador: boolean
  currentUserId: string
  produtos: ProdutoComVariacoesParaForm[]
  podeCriar: boolean
}

export function KanbanBoard({
  ordens,
  podeMover,
  isOperador,
  currentUserId,
  produtos,
  podeCriar,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [novaOpOpen, setNovaOpOpen] = useState(false)
  const [filtros, setFiltros] = useState<Set<FiltroChip>>(new Set())

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

  function mover(ordemId: string, novoStatus: (typeof statusValues)[number]) {
    const ordem = items.find((o) => o.id === ordemId)
    if (!ordem || ordem.status === novoStatus) return
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

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    mover(String(active.id), String(over.id) as (typeof statusValues)[number])
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['minhas', 'urgentes', 'atrasadas', 'semDono'] as FiltroChip[]).map(
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
            Nova OP rápida
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
              isOperador={isOperador}
              currentUserId={currentUserId}
              isPending={isPending}
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
        currentUserId={currentUserId}
      />

      <QuickOrdemDialog
        open={novaOpOpen}
        onClose={() => setNovaOpOpen(false)}
        produtos={produtos}
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
  isOperador,
  currentUserId,
  isPending,
  onMover,
  onAbrirDetalhe,
}: {
  status: (typeof statusValues)[number]
  ordens: KanbanCardData[]
  podeMover: boolean
  isOperador: boolean
  currentUserId: string
  isPending: boolean
  onMover: (id: string, status: (typeof statusValues)[number]) => void
  onAbrirDetalhe: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const styles = COLUMN_STYLES[status]
  const limite = WIP_LIMITES[status]
  const acima = limite != null && ordens.length > limite
  const cheio = limite != null && ordens.length === limite

  // Agrupa por produto: 2+ OPs do mesmo produto viram uma "pasta".
  const grupos = useMemo(() => agruparPorProduto(ordens), [ordens])

  return (
    <div className="flex w-[78vw] max-w-64 shrink-0 snap-start flex-col sm:w-64">
      <header
        className={cn(
          'mb-2 flex items-center justify-between rounded-md px-3 py-2 text-xs font-medium',
          styles.header,
          acima && 'ring-1 ring-destructive/50',
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn('inline-block h-2 w-2 rounded-full', styles.bar)} />
          {STATUS_LABEL_CURTO[status]}
        </span>
        <span
          className={cn(
            'tabular-nums',
            acima
              ? 'text-destructive font-semibold'
              : cheio
                ? 'font-semibold opacity-90'
                : 'opacity-70',
          )}
          title={limite != null ? `Limite da etapa: ${limite}` : undefined}
        >
          {ordens.length}
          {limite != null && `/${limite}`}
        </span>
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
        {grupos.map((g) =>
          g.ops.length >= 2 ? (
            <PastaProduto
              key={g.key}
              grupo={g}
              podeMover={podeMover}
              isOperador={isOperador}
              currentUserId={currentUserId}
              isPending={isPending}
              onMover={onMover}
              onAbrirDetalhe={onAbrirDetalhe}
            />
          ) : (
            <KanbanCard
              key={g.ops[0].id}
              ordem={g.ops[0]}
              podeMover={podeMover}
              isOperador={isOperador}
              currentUserId={currentUserId}
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
  isOperador,
  currentUserId,
  isPending,
  onMover,
  onAbrirDetalhe,
}: {
  grupo: GrupoProduto
  podeMover: boolean
  isOperador: boolean
  currentUserId: string
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
  const algumAtrasada = grupo.ops.some((o) => o.atrasada)

  return (
    <div className="bg-card rounded-lg border shadow-sm">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="hover:bg-muted/40 flex w-full items-center justify-between gap-2 rounded-lg p-2.5 text-left transition-colors"
      >
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
            className={cn('size-3.5 transition-transform', aberta && 'rotate-180')}
          />
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
                  isOperador={isOperador}
                  currentUserId={currentUserId}
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
  isOperador,
  currentUserId,
  isPending,
  onMover,
  onAbrirDetalhe,
}: {
  ordem: KanbanCardData
  podeMover: boolean
  isOperador: boolean
  currentUserId: string
  isPending: boolean
  onMover: (id: string, status: (typeof statusValues)[number]) => void
  onAbrirDetalhe: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ordem.id,
    disabled: !podeMover || isPending,
  })

  // Operador só move a OP que é dele; manager move qualquer uma.
  const podeMoverEsta =
    podeMover && (!isOperador || ordem.responsavelId === currentUserId)

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
        currentUserId={currentUserId}
        podeMoverEsta={podeMoverEsta}
        onMover={onMover}
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
        'mt-1 flex w-full items-center justify-center gap-1.5 rounded border py-1 text-[11px] font-medium transition-colors disabled:opacity-60',
        semDono
          ? 'border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {semDono ? (
        <>
          <Hand className="size-3" />
          Pegar pra mim
        </>
      ) : (
        <>
          <Undo2 className="size-3" />
          Soltar
        </>
      )}
    </button>
  )
}

// Conteúdo visual do card (reutilizado pelo DragOverlay). Compacto.
function KanbanCardContent({
  ordem,
  dragging,
  currentUserId,
  podeMoverEsta,
  onMover,
}: {
  ordem: KanbanCardData
  dragging?: boolean
  currentUserId?: string
  podeMoverEsta?: boolean
  onMover?: (id: string, status: (typeof statusValues)[number]) => void
}) {
  const tempo = tempoNaEtapa(ordem.desdeStatus)
  const idx = STATUS_KANBAN.indexOf(ordem.status)
  const proximo =
    idx >= 0 && idx < STATUS_KANBAN.length - 1 ? STATUS_KANBAN[idx + 1] : null
  const variacao = [ordem.variacaoCor, ordem.variacaoTamanho]
    .filter(Boolean)
    .join('/')
  const destaque =
    ordem.prioridade === 'alta' || ordem.prioridade === 'urgente'

  return (
    <article
      style={
        ordem.estacaoCor
          ? { borderLeftColor: ordem.estacaoCor, borderLeftWidth: 3 }
          : undefined
      }
      title={ordem.estacaoNome ?? undefined}
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

      {/* Linha 2: meta compacta */}
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
        <span className="tabular-nums">
          {ordem.quantidade.toLocaleString('pt-BR')} un
        </span>
        {variacao && <span className="truncate">{variacao}</span>}
        <span
          className={cn(
            'inline-flex items-center gap-0.5',
            tempo.aging && 'text-destructive font-medium',
          )}
          title="Tempo nesta etapa"
        >
          <Clock className="size-2.5" />
          {tempo.label}
        </span>
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
        {ordem.responsavelNome && (
          <span className="inline-flex items-center gap-0.5">
            {ordem.estacaoCor && (
              <span
                className="inline-block size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: ordem.estacaoCor }}
              />
            )}
            {ordem.responsavelNome.split(' ')[0]}
          </span>
        )}
      </div>

      {ordem.produzido > 0 && (
        <div
          className="bg-muted mt-1 h-1 overflow-hidden rounded-full"
          title={`Produzido ${ordem.produzido}/${ordem.quantidade}`}
        >
          <div
            className={cn(
              'h-full rounded-full',
              ordem.produzido >= ordem.quantidade
                ? 'bg-emerald-500'
                : 'bg-primary',
            )}
            style={{
              width: `${Math.min(100, (ordem.produzido / ordem.quantidade) * 100)}%`,
            }}
          />
        </div>
      )}

      {currentUserId && (
        <PegarSoltar ordem={ordem} currentUserId={currentUserId} />
      )}
    </article>
  )
}
