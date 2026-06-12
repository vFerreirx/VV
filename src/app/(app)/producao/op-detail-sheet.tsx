'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ExternalLink, Loader2, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  listarEventosOrdem,
  type EventoKanbanComUsuario,
} from './actions'
import {
  excluirOrdemAction,
  mudarStatusOrdemAction,
  obterOrdem,
  type OrdemDetalhe,
} from '@/app/(app)/ordens/actions'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  CANAL_LABEL,
  PRIORIDADE_LABEL,
  STATUS_LABEL,
  STATUS_LABEL_CURTO,
  statusValues,
} from '@/lib/validators/ordens'

export function OpDetailSheet({
  ordemId,
  onClose,
}: {
  ordemId: string | null
  onClose: () => void
}) {
  return (
    <Sheet open={ordemId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {/* Key força remontagem ao trocar de OP — evita setState em effect. */}
        {ordemId && (
          <DetalheBody key={ordemId} ordemId={ordemId} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

// -----------------------------------------------------------------
// Body — só monta quando ordemId existe (controlado pela key acima)
// -----------------------------------------------------------------

function DetalheBody({
  ordemId,
  onClose,
}: {
  ordemId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [ordem, setOrdem] = useState<OrdemDetalhe | null>(null)
  const [eventos, setEventos] = useState<EventoKanbanComUsuario[]>([])
  const [, startTransition] = useTransition()
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)
  const [excluindo, startExcluir] = useTransition()

  function excluir() {
    if (!ordem) return
    startExcluir(async () => {
      const result = await excluirOrdemAction(ordem.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'OP excluída')
      setConfirmarExcluir(false)
      onClose()
      router.refresh()
    })
  }

  useEffect(() => {
    let cancelado = false
    Promise.all([obterOrdem(ordemId), listarEventosOrdem(ordemId)]).then(
      ([o, e]) => {
        if (cancelado) return
        setOrdem(o)
        setEventos(e)
      },
    )
    return () => {
      cancelado = true
    }
  }, [ordemId])

  function handleMudarStatus(novoStatus: (typeof statusValues)[number]) {
    if (!ordem || ordem.status === novoStatus) return
    const anterior = ordem.status

    setOrdem({ ...ordem, status: novoStatus })

    startTransition(async () => {
      const result = await mudarStatusOrdemAction(ordem.id, {
        status: novoStatus,
      })
      if (!result.success) {
        setOrdem({ ...ordem, status: anterior })
        toast.error(result.error)
        return
      }
      toast.success('Status atualizado')
      const novosEventos = await listarEventosOrdem(ordem.id)
      setEventos(novosEventos)
    })
  }

  if (!ordem) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          Carregando…
        </div>
      </div>
    )
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono">{ordem.numero}</SheetTitle>
        <SheetDescription>{ordem.produto.nome}</SheetDescription>
      </SheetHeader>

      <div className="space-y-5 px-4 pb-4">
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Status
          </h3>
          <Select
            value={ordem.status}
            onValueChange={(v) =>
              v && handleMudarStatus(v as (typeof statusValues)[number])
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusValues.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Detalhes
          </h3>
          <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <Detail label="Produto SKU" value={ordem.produto.sku} mono />
            <Detail
              label="Variação"
              value={
                ordem.variacao
                  ? [
                      ordem.variacao.cor,
                      ordem.variacao.modelo,
                      ordem.variacao.tamanho,
                    ]
                      .filter(Boolean)
                      .join(' / ') || ordem.variacao.skuVariacao
                  : '—'
              }
            />
            <Detail
              label="Quantidade"
              value={`${ordem.quantidade.toLocaleString('pt-BR')} un`}
            />
            <Detail
              label="Máquina"
              value={ordem.maquina ? `${ordem.maquina.codigo}` : '—'}
              mono
            />
            <Detail label="Canal" value={CANAL_LABEL[ordem.canalDestino]} />
            <Detail
              label="Prioridade"
              value={PRIORIDADE_LABEL[ordem.prioridade]}
            />
            <Detail
              label="Responsável"
              value={ordem.responsavel?.nome ?? '—'}
            />
            <Detail
              label="Início previsto"
              value={
                ordem.dataPrevistaInicio
                  ? format(new Date(ordem.dataPrevistaInicio), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
            <Detail
              label="Fim previsto"
              value={
                ordem.dataPrevistaFim
                  ? format(new Date(ordem.dataPrevistaFim), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
            <Detail
              label="Início real"
              value={
                ordem.dataRealInicio
                  ? format(new Date(ordem.dataRealInicio), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
            <Detail
              label="Fim real"
              value={
                ordem.dataRealFim
                  ? format(new Date(ordem.dataRealFim), 'dd/MM/yy', {
                      locale: ptBR,
                    })
                  : '—'
              }
            />
          </dl>
        </section>

        {ordem.observacoes && (
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Observações
            </h3>
            <p className="text-sm whitespace-pre-wrap">{ordem.observacoes}</p>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Histórico ({eventos.length})
          </h3>
          {eventos.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Sem eventos registrados.
            </p>
          ) : (
            <ol className="space-y-2 text-xs">
              {eventos.map((ev) => (
                <li
                  key={ev.id}
                  className="border-l-2 border-foreground/10 pl-3"
                >
                  <div className="flex flex-wrap items-center gap-1">
                    {ev.statusAnterior ? (
                      <>
                        <Badge variant="secondary">
                          {STATUS_LABEL_CURTO[ev.statusAnterior]}
                        </Badge>
                        <span className="text-muted-foreground">→</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">criada</span>
                    )}
                    <Badge variant="default">
                      {STATUS_LABEL_CURTO[ev.statusNovo]}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {ev.usuarioNome ?? 'Sistema'} ·{' '}
                    {format(new Date(ev.createdAt), "dd/MM/yy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </div>
                  {ev.observacao && (
                    <div className="text-muted-foreground italic">
                      {ev.observacao}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmarExcluir(true)}
            disabled={excluindo}
          >
            <Trash2 className="text-destructive" />
            Excluir OP
          </Button>
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/ordens/${ordem.id}`} />}
          >
            <ExternalLink />
            Abrir OP completa
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmarExcluir}
        onOpenChange={(o) => !o && setConfirmarExcluir(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir OP {ordem.numero}?</DialogTitle>
            <DialogDescription>
              A ordem será cancelada e removida do kanban. O histórico fica
              preservado para referência.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmarExcluir(false)}
              disabled={excluindo}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={excluir}
              disabled={excluindo}
            >
              {excluindo ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <>
      <dt className="text-xs">{label}</dt>
      <dd
        className={cn(
          'text-foreground text-right tabular-nums',
          mono && 'font-mono',
        )}
      >
        {value}
      </dd>
    </>
  )
}
