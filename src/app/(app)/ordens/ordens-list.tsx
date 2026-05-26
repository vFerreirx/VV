'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CircleAlert, Pencil, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { excluirOrdemAction, type OrdemListItem } from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const PRIORIDADE_BADGE: Record<(typeof prioridadeValues)[number], string> = {
  baixa: 'bg-muted text-muted-foreground',
  normal: 'bg-secondary text-secondary-foreground',
  alta: 'bg-orange-500/15 text-orange-600',
  urgente: 'bg-destructive/15 text-destructive',
}

type Props = {
  ordens: OrdemListItem[]
  podeEditar: boolean
  filtrosIniciais: OrdensFiltros
}

export function OrdensList({ ordens, podeEditar, filtrosIniciais }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState(filtrosIniciais.q ?? '')
  const [excluindo, setExcluindo] = useState<OrdemListItem | null>(null)

  function aplicarFiltro(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === 'todos' || v === 'todas') params.delete(k)
      else params.set(k, v)
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function onBuscaSubmit(e: React.FormEvent) {
    e.preventDefault()
    aplicarFiltro({ q: busca.trim() || undefined })
  }

  return (
    <div className="space-y-4">
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
            onValueChange={(v) =>
              aplicarFiltro({ prioridade: v ?? undefined })
            }
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
        </div>
      </div>

      {ordens.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">Nenhuma OP encontrada.</p>
          {podeEditar && (
            <Button
              size="sm"
              className="mt-3"
              render={<Link href="/ordens/novo" />}
            >
              Criar primeira OP
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd (un)</TableHead>
                  <TableHead>Máquina</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prev. fim</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordens.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/ordens/${o.id}`}
                        className="hover:underline"
                      >
                        {o.numero}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{o.produtoNome}</div>
                      <div className="text-muted-foreground text-xs">
                        {[o.variacaoCor, o.variacaoTamanho]
                          .filter(Boolean)
                          .join(' / ') || o.produtoSku}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.quantidade.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {o.maquinaCodigo ?? '—'}
                    </TableCell>
                    <TableCell>{CANAL_LABEL_CURTO[o.canalDestino]}</TableCell>
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
                      className={cn(
                        'tabular-nums',
                        o.atrasada && 'text-destructive font-medium',
                      )}
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
          <div className="space-y-3 md:hidden">
            {ordens.map((o) => (
              <Link
                key={o.id}
                href={`/ordens/${o.id}`}
                className="block rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs">{o.numero}</div>
                    <div className="truncate font-medium">{o.produtoNome}</div>
                    <div className="text-muted-foreground text-xs">
                      {[o.variacaoCor, o.variacaoTamanho]
                        .filter(Boolean)
                        .join(' / ') || o.produtoSku}
                    </div>
                  </div>
                  <Badge className={STATUS_BADGE[o.status]}>
                    {STATUS_LABEL_CURTO[o.status]}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>Quantidade</div>
                  <div className="text-foreground text-right tabular-nums">
                    {o.quantidade.toLocaleString('pt-BR')} un
                  </div>
                  <div>Máquina</div>
                  <div className="text-foreground text-right font-mono">
                    {o.maquinaCodigo ?? '—'}
                  </div>
                  <div>Canal</div>
                  <div className="text-foreground text-right">
                    {CANAL_LABEL_CURTO[o.canalDestino]}
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
              </Link>
            ))}
          </div>
        </>
      )}

      <ExcluirDialog ordem={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog de exclusão
// -----------------------------------------------------------------

function ExcluirDialog({
  ordem,
  onClose,
}: {
  ordem: OrdemListItem | null
  onClose: () => void
}) {
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
            {ordem?.numero} ({ordem?.produtoNome}) será marcada como cancelada
            e removida do kanban. Apontamentos e movimentações ficam preservados.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={excluir}
            disabled={isPending}
          >
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
