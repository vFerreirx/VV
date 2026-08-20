'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { excluirMultiplasOrdensAction, excluirOrdemAction, type OrdemListItem } from './actions'
import type { RemessaFullOpcao } from './remessas-actions'
import { Badge } from '@/components/ui/badge'
import { BulkActionBar } from '@/components/ui/bulk-action-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PRIORIDADE_BADGE } from '@/lib/prioridade'
import { cn } from '@/lib/utils'
import {
  CANAL_LABEL_CURTO,
  PRIORIDADE_LABEL,
  STATUS_LABEL_CURTO,
  canalValues,
  prioridadeValues,
  statusValues,
  type OrdensFiltros,
} from '@/lib/validators/ordens'

const STATUS_BADGE: Record<(typeof statusValues)[number], string> = {
  aguardando_materia_prima: 'bg-zinc-500 text-white',
  programado: 'bg-blue-500 text-white',
  em_producao: 'bg-emerald-500 text-white',
  acabamento: 'bg-cyan-600 text-white',
  embalagem: 'bg-violet-500 text-white',
  pronto_envio: 'bg-amber-500 text-white',
  enviado: 'bg-emerald-700 text-white',
  cancelado: 'bg-muted text-muted-foreground',
}

type Props = {
  ordens: OrdemListItem[]
  total: number
  pagina: number
  totalPaginas: number
  remessas: RemessaFullOpcao[]
  podeEditar: boolean
  filtrosIniciais: OrdensFiltros
}

export function OrdensList({
  ordens,
  total,
  pagina,
  totalPaginas,
  remessas,
  podeEditar,
  filtrosIniciais,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState(filtrosIniciais.q ?? '')
  const [excluindo, setExcluindo] = useState<OrdemListItem | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [bulkExcluindo, setBulkExcluindo] = useState(false)

  function toggleOne(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelecionados((prev) => {
      if (prev.size === ordens.length) return new Set()
      return new Set(ordens.map((o) => o.id))
    })
  }
  function limparSelecao() {
    setSelecionados(new Set())
  }
  const allChecked = ordens.length > 0 && selecionados.size === ordens.length
  const someChecked = selecionados.size > 0 && !allChecked
  const idsSelecionados = useMemo(() => Array.from(selecionados), [selecionados])

  function aplicarFiltro(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === 'todos' || v === 'todas') params.delete(k)
      else params.set(k, v)
    }
    // Mudou filtro -> volta pra primeira página.
    if (!('pagina' in updates)) params.delete('pagina')
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function irPagina(n: number) {
    aplicarFiltro({ pagina: n <= 1 ? undefined : String(n) })
  }

  function onBuscaSubmit(e: React.FormEvent) {
    e.preventDefault()
    aplicarFiltro({ q: busca.trim() || undefined })
  }

  // Atalhos rápidos de status (Todas / Concluídas / Canceladas).
  const statusAtual =
    filtrosIniciais.status && filtrosIniciais.status !== 'todos'
      ? filtrosIniciais.status
      : undefined

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'Todas', val: undefined as string | undefined },
          { label: 'Concluídas', val: 'enviado' },
          { label: 'Canceladas', val: 'cancelado' },
        ].map((chip) => {
          const ativo = statusAtual === chip.val
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => aplicarFiltro({ status: chip.val })}
              disabled={isPending}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                ativo ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={onBuscaSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Buscar por número, SKU ou produto…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
              disabled={isPending}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Buscar
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filtrosIniciais.status ?? 'todos'}
            onValueChange={(v) => aplicarFiltro({ status: v ?? undefined })}
          >
            <SelectTrigger size="sm" className="min-w-[10rem]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              {statusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL_CURTO[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtrosIniciais.canal ?? 'todos'}
            onValueChange={(v) => aplicarFiltro({ canal: v ?? undefined })}
          >
            <SelectTrigger size="sm" className="min-w-[8rem]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos canais</SelectItem>
              {canalValues.map((c) => (
                <SelectItem key={c} value={c}>
                  {CANAL_LABEL_CURTO[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtrosIniciais.prioridade ?? 'todas'}
            onValueChange={(v) => aplicarFiltro({ prioridade: v ?? undefined })}
          >
            <SelectTrigger size="sm" className="min-w-[8rem]">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas prioridades</SelectItem>
              {prioridadeValues.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORIDADE_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {remessas.length > 0 && (
            <Select
              value={filtrosIniciais.remessaId ?? 'todas'}
              onValueChange={(v) => aplicarFiltro({ remessaId: v ?? undefined })}
            >
              <SelectTrigger size="sm" className="min-w-[9rem]">
                <SelectValue placeholder="Full" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os Fulls</SelectItem>
                {remessas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {CANAL_LABEL_CURTO[r.canal]} ·{' '}
                    {`${r.dataEnvio.slice(8, 10)}/${r.dataEnvio.slice(5, 7)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {podeEditar && (
        <BulkActionBar
          count={selecionados.size}
          onClear={limparSelecao}
          onDelete={() => setBulkExcluindo(true)}
        />
      )}

      {ordens.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma OP encontrada"
          description="Crie ordens de produção pra acompanhar no kanban e dar entrada no estoque."
          action={
            podeEditar ? (
              <Button size="sm" render={<Link href="/ordens/novo" />}>
                Criar primeira OP
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {podeEditar && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Selecionar tudo"
                        checked={allChecked}
                        indeterminate={someChecked}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Número</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd (un)</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prev. fim</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordens.map((o) => (
                  <TableRow key={o.id} data-state={selecionados.has(o.id) ? 'selected' : undefined}>
                    {podeEditar && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Selecionar ${o.numero}`}
                          checked={selecionados.has(o.id)}
                          onCheckedChange={() => toggleOne(o.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">
                      <Link href={`/ordens/${o.id}`} className="hover:underline">
                        {o.numero}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{o.produtoNome}</div>
                      <div className="text-muted-foreground text-xs">
                        {[o.variacaoCor, o.variacaoTamanho].filter(Boolean).join(' / ') ||
                          o.produtoSku}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.quantidade.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>{o.maquinaNome ?? '—'}</TableCell>
                    <TableCell>
                      {o.responsavelNome ?? <span className="text-muted-foreground">Na fila</span>}
                    </TableCell>
                    <TableCell>
                      {CANAL_LABEL_CURTO[o.canalDestino]}
                      {o.remessaData && (
                        <span className="text-muted-foreground"> · {o.remessaData}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={PRIORIDADE_BADGE[o.prioridade]}>
                        {PRIORIDADE_LABEL[o.prioridade]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_BADGE[o.status]}>
                        {STATUS_LABEL_CURTO[o.status]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn('tabular-nums', o.atrasada && 'text-destructive font-medium')}
                    >
                      <span className="inline-flex items-center gap-1">
                        {o.atrasada && <CircleAlert className="size-3.5" />}
                        {o.dataPrevistaFim
                          ? format(new Date(o.dataPrevistaFim), 'dd/MM/yy', {
                              locale: ptBR,
                            })
                          : '—'}
                      </span>
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            render={<Link href={`/ordens/${o.id}`} />}
                            aria-label="Editar"
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setExcluindo(o)}
                            aria-label="Excluir"
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile / tablet retrato */}
          <div className="vv-reveal space-y-3 md:hidden">
            {ordens.map((o) => (
              <div key={o.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {podeEditar && (
                      <Checkbox
                        aria-label={`Selecionar ${o.numero}`}
                        checked={selecionados.has(o.id)}
                        onCheckedChange={() => toggleOne(o.id)}
                        className="mt-1"
                      />
                    )}
                    <Link href={`/ordens/${o.id}`} className="min-w-0 flex-1 hover:underline">
                      <div className="font-mono text-xs">{o.numero}</div>
                      <div className="truncate font-medium">{o.produtoNome}</div>
                      <div className="text-muted-foreground text-xs">
                        {[o.variacaoCor, o.variacaoTamanho].filter(Boolean).join(' / ') ||
                          o.produtoSku}
                      </div>
                    </Link>
                  </div>
                  <Badge className={STATUS_BADGE[o.status]}>{STATUS_LABEL_CURTO[o.status]}</Badge>
                </div>
                <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>Quantidade</div>
                  <div className="text-foreground text-right tabular-nums">
                    {o.quantidade.toLocaleString('pt-BR')} un
                  </div>
                  <div>Máquina</div>
                  <div className="text-foreground text-right">{o.maquinaNome ?? '—'}</div>
                  <div>Responsável</div>
                  <div className="text-foreground text-right">{o.responsavelNome ?? 'Na fila'}</div>
                  <div>Canal</div>
                  <div className="text-foreground text-right">
                    {CANAL_LABEL_CURTO[o.canalDestino]}
                    {o.remessaData ? ` · ${o.remessaData}` : ''}
                  </div>
                  <div>Prioridade</div>
                  <div className="text-right">
                    <Badge className={PRIORIDADE_BADGE[o.prioridade]}>
                      {PRIORIDADE_LABEL[o.prioridade]}
                    </Badge>
                  </div>
                  <div>Prev. fim</div>
                  <div
                    className={cn(
                      'text-right tabular-nums',
                      o.atrasada && 'text-destructive font-medium',
                    )}
                  >
                    {o.dataPrevistaFim
                      ? format(new Date(o.dataPrevistaFim), 'dd/MM/yy', {
                          locale: ptBR,
                        })
                      : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-sm tabular-nums">
                Página {pagina} de {totalPaginas} · {total} OPs
              </span>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => irPagina(pagina - 1)}
                  disabled={isPending || pagina <= 1}
                >
                  <ChevronLeft />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => irPagina(pagina + 1)}
                  disabled={isPending || pagina >= totalPaginas}
                >
                  Próxima
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ExcluirDialog ordem={excluindo} onClose={() => setExcluindo(null)} />
      <BulkExcluirDialog
        open={bulkExcluindo}
        ids={idsSelecionados}
        onClose={() => setBulkExcluindo(false)}
        onDone={() => {
          setBulkExcluindo(false)
          limparSelecao()
        }}
      />
    </div>
  )
}

function BulkExcluirDialog({
  open,
  ids,
  onClose,
  onDone,
}: {
  open: boolean
  ids: string[]
  onClose: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await excluirMultiplasOrdensAction(ids)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluídas')
      router.refresh()
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Excluir {ids.length} OP{ids.length === 1 ? '' : 's'}?
          </DialogTitle>
          <DialogDescription>
            As OPs selecionadas serão marcadas como canceladas e removidas do kanban. Apontamentos e
            movimentações ficam preservados.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} variant="destructive" onClick={excluir} disabled={isPending}>
            {`Excluir ${ids.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Dialog de exclusão
// -----------------------------------------------------------------

function ExcluirDialog({ ordem, onClose }: { ordem: OrdemListItem | null; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!ordem) return
    startTransition(async () => {
      const result = await excluirOrdemAction(ordem.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluída')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={ordem !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir OP?</DialogTitle>
          <DialogDescription>
            {ordem?.numero} ({ordem?.produtoNome}) será marcada como cancelada e removida do kanban.
            Apontamentos e movimentações ficam preservados.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} variant="destructive" onClick={excluir} disabled={isPending}>
            {'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
