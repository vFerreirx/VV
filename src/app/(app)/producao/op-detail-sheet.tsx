'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Hand,
  Loader2,
  Trash2,
  Undo2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  listarEventosOrdem,
  type EventoKanbanComUsuario,
} from './actions'
import {
  apontarProducaoAction,
  excluirOrdemAction,
  listarApontamentos,
  mudarStatusOrdemAction,
  obterOrdem,
  pegarOrdemAction,
  soltarOrdemAction,
  type ApontamentoItem,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  CANAL_LABEL,
  PRIORIDADE_LABEL,
  STATUS_KANBAN,
  STATUS_LABEL,
  STATUS_LABEL_CURTO,
  statusValues,
} from '@/lib/validators/ordens'

// Fluxo de avanço: as etapas do kanban + "enviado" (concluído) no fim.
const FLUXO: (typeof statusValues)[number][] = [...STATUS_KANBAN, 'enviado']

export function OpDetailSheet({
  ordemId,
  onClose,
  currentUserId,
}: {
  ordemId: string | null
  onClose: () => void
  currentUserId: string
}) {
  return (
    <Sheet open={ordemId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {/* Key força remontagem ao trocar de OP — evita setState em effect. */}
        {ordemId && (
          <DetalheBody
            key={ordemId}
            ordemId={ordemId}
            onClose={onClose}
            currentUserId={currentUserId}
          />
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
  currentUserId,
}: {
  ordemId: string
  onClose: () => void
  currentUserId: string
}) {
  const router = useRouter()
  const [ordem, setOrdem] = useState<OrdemDetalhe | null>(null)
  const [eventos, setEventos] = useState<EventoKanbanComUsuario[]>([])
  const [apontamentos, setApontamentos] = useState<ApontamentoItem[]>([])
  const [produzido, setProduzido] = useState(0)
  const [refugoTotal, setRefugoTotal] = useState(0)
  const [, startTransition] = useTransition()
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)
  const [excluindo, startExcluir] = useTransition()
  const [acaoPend, startAcao] = useTransition()
  const [apontarOpen, setApontarOpen] = useState(false)
  const [qtdProduzida, setQtdProduzida] = useState('')
  const [qtdRefugo, setQtdRefugo] = useState('')
  const [apontando, startApontar] = useTransition()

  async function recarregarApontamentos(id: string) {
    const a = await listarApontamentos(id)
    setApontamentos(a.itens)
    setProduzido(a.totalProduzido)
    setRefugoTotal(a.totalRefugo)
  }

  function apontar() {
    if (!ordem) return
    startApontar(async () => {
      const result = await apontarProducaoAction(ordem.id, {
        produzida: qtdProduzida,
        refugo: qtdRefugo,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Apontado')
      setQtdProduzida('')
      setQtdRefugo('')
      setApontarOpen(false)
      await recarregarApontamentos(ordem.id)
      router.refresh()
    })
  }

  function pegarOuSoltar(pegar: boolean) {
    if (!ordem) return
    startAcao(async () => {
      const result = pegar
        ? await pegarOrdemAction(ordem.id)
        : await soltarOrdemAction(ordem.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Pronto')
      const novo = await obterOrdem(ordem.id)
      if (novo) setOrdem(novo)
      router.refresh()
    })
  }

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
    Promise.all([
      obterOrdem(ordemId),
      listarEventosOrdem(ordemId),
      listarApontamentos(ordemId),
    ]).then(([o, e, a]) => {
      if (cancelado) return
      setOrdem(o)
      setEventos(e)
      setApontamentos(a.itens)
      setProduzido(a.totalProduzido)
      setRefugoTotal(a.totalRefugo)
    })
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
      // Enviado/cancelado saem do kanban — fecha o painel e atualiza o board.
      if (novoStatus === 'enviado' || novoStatus === 'cancelado') {
        toast.success(
          novoStatus === 'enviado' ? 'OP concluída e enviada' : 'OP cancelada',
        )
        onClose()
        router.refresh()
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
        {/* Ações rápidas */}
        {(() => {
          const idx = FLUXO.indexOf(ordem.status)
          const proximo = idx >= 0 ? FLUXO[idx + 1] : undefined
          const concluir = proximo === 'enviado'
          const semDono = !ordem.responsavel
          const meu = ordem.responsavel?.id === currentUserId

          return (
            <section className="space-y-2">
              <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Ações
              </h3>

              {proximo && (
                <Button
                  className={cn(
                    'w-full',
                    concluir &&
                      'bg-emerald-600 text-white hover:bg-emerald-700',
                  )}
                  disabled={acaoPend}
                  onClick={() => handleMudarStatus(proximo)}
                >
                  {concluir ? (
                    <>
                      <CheckCircle2 />
                      Concluir e enviar
                    </>
                  ) : (
                    <>
                      <ChevronRight />
                      Avançar p/ {STATUS_LABEL[proximo]}
                    </>
                  )}
                </Button>
              )}

              {(semDono || meu) && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={acaoPend}
                  onClick={() => pegarOuSoltar(semDono)}
                >
                  {semDono ? (
                    <>
                      <Hand />
                      Pegar pra mim
                    </>
                  ) : (
                    <>
                      <Undo2 />
                      Soltar (voltar pra fila)
                    </>
                  )}
                </Button>
              )}

              {meu && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={acaoPend}
                  onClick={() => setApontarOpen(true)}
                >
                  <ClipboardList />
                  Apontar produção
                </Button>
              )}
            </section>
          )
        })()}

        {/* Produção (progresso + apontamentos) */}
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Produção
          </h3>
          <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
            <span>Produzido</span>
            <span className="text-foreground font-medium">
              {produzido}/{ordem.quantidade} un
              {refugoTotal > 0 && (
                <span className="text-destructive ml-2">
                  {refugoTotal} refugo
                </span>
              )}
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full',
                produzido >= ordem.quantidade
                  ? 'bg-emerald-500'
                  : 'bg-primary',
              )}
              style={{
                width: `${Math.min(100, ordem.quantidade > 0 ? (produzido / ordem.quantidade) * 100 : 0)}%`,
              }}
            />
          </div>
          {apontamentos.length > 0 && (
            <ul className="text-muted-foreground space-y-1 pt-1 text-xs">
              {apontamentos.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {a.operadorNome ?? 'Operador'} ·{' '}
                    {format(new Date(a.em), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                  <span className="text-foreground shrink-0 tabular-nums">
                    +{a.produzida}
                    {a.refugo > 0 && (
                      <span className="text-destructive"> /{a.refugo}r</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Status manual
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

      <Dialog open={apontarOpen} onOpenChange={(o) => !o && setApontarOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apontar produção</DialogTitle>
            <DialogDescription>
              Quantas peças ficaram prontas agora? Vai somando ao total
              ({produzido}/{ordem.quantidade}).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-prod">Prontas</Label>
              <Input
                id="ap-prod"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={qtdProduzida}
                onChange={(e) => setQtdProduzida(e.target.value)}
                disabled={apontando}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-refugo">Refugo</Label>
              <Input
                id="ap-refugo"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="0"
                value={qtdRefugo}
                onChange={(e) => setQtdRefugo(e.target.value)}
                disabled={apontando}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApontarOpen(false)}
              disabled={apontando}
            >
              Cancelar
            </Button>
            <Button onClick={apontar} disabled={apontando}>
              {apontando ? 'Salvando…' : 'Apontar'}
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
