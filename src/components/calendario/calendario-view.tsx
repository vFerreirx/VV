'use client'

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Plus,
  Truck,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  criarEventoFullAction,
  excluirEventoFullAction,
  type EventoFullItem,
  type OpAgendaItem,
  type ParcelaAgendaItem,
} from '@/app/(app)/calendario/actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { rotuloDaSituacao } from '@/lib/parcela-estado'
import { corDoCanal } from '@/lib/producao/cor-do-canal'
import {
  ehEventoDuplicado,
  rotuloDoEventoFull,
} from '@/lib/producao/prazo-da-remessa'
import { cn } from '@/lib/utils'
import {
  EVENTO_FULL_CANAL_CURTO,
  EVENTO_FULL_CANAL_LABEL,
  eventoFullCanalValues,
} from '@/lib/validators/eventos'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// A COR DO CANAL é a de src/lib/producao/cor-do-canal.ts, a mesma do tablet
// e do kanban. O calendário tinha a própria, com o ML em âmbar, e o ML ficava
// com dois amarelos: o do gerente aqui e o do operador lá.
type CanalDoEvento = (typeof eventoFullCanalValues)[number]

/** A etiqueta do envio no dia: a faixa clara com texto escuro. */
const CANAL_BADGE: Record<CanalDoEvento, string> = {
  full_ml: corDoCanal('full_ml')?.faixa ?? '',
  full_shopee: corDoCanal('full_shopee')?.faixa ?? '',
}

/** O quadradinho da legenda: a cor cheia, a da barra do tablet. */
const CANAL_LEGENDA: Record<CanalDoEvento, string> = {
  full_ml: corDoCanal('full_ml')?.barra ?? '',
  full_shopee: corDoCanal('full_shopee')?.barra ?? '',
}

type Props = {
  mes: string // YYYY-MM
  eventos: EventoFullItem[]
  ops: OpAgendaItem[]
  /**
   * Boletos a receber do período. Vem VAZIO pra quem não é admin — a
   * consulta nem acontece no servidor (ver `listarParcelasDoPeriodo`).
   */
  parcelas: ParcelaAgendaItem[]
  /** Contas de envio Full ativas, pro diálogo de agendar. */
  contas: { id: string; nome: string }[]
  podeEditar: boolean
}

export function CalendarioView({
  mes,
  eventos,
  ops,
  parcelas,
  contas,
  podeEditar,
}: Props) {
  const router = useRouter()
  const [novoDia, setNovoDia] = useState<string | null>(null)

  const refDate = useMemo(
    () => parse(`${mes}-01`, 'yyyy-MM-dd', new Date()),
    [mes],
  )

  const dias = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(refDate), { weekStartsOn: 0 })
    const gridEnd = endOfWeek(endOfMonth(refDate), { weekStartsOn: 0 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [refDate])

  // Agrupa eventos e OPs por dia (YYYY-MM-DD).
  const eventosPorDia = useMemo(() => {
    const m = new Map<string, EventoFullItem[]>()
    for (const e of eventos) {
      const arr = m.get(e.data) ?? []
      arr.push(e)
      m.set(e.data, arr)
    }
    return m
  }, [eventos])

  const parcelasPorDia = useMemo(() => {
    const m = new Map<string, ParcelaAgendaItem[]>()
    for (const p of parcelas) {
      const arr = m.get(p.data) ?? []
      arr.push(p)
      m.set(p.data, arr)
    }
    return m
  }, [parcelas])

  // As remessas REAIS do mês — é contra elas que o evento manual é comparado.
  const remessasDoMes = useMemo(
    () => eventos.filter((e) => e.remessa).map((e) => ({ data: e.data, canal: e.canal })),
    [eventos],
  )

  const opsPorDia = useMemo(() => {
    const m = new Map<string, OpAgendaItem[]>()
    for (const o of ops) {
      const arr = m.get(o.data) ?? []
      arr.push(o)
      m.set(o.data, arr)
    }
    return m
  }, [ops])

  function irPara(novoMes: Date) {
    router.push(`/calendario?mes=${format(novoMes, 'yyyy-MM')}`)
  }

  const hojeYmd = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold capitalize">
            {format(refDate, 'MMMM yyyy', { locale: ptBR })}
          </h1>
          <p className="text-muted-foreground text-sm">
            Envios pro Full, ordens com prazo de entrega
            {parcelas.length > 0 ? ' e boletos a receber' : ''}.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mês anterior"
            onClick={() => irPara(addMonths(refDate, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => irPara(new Date())}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próximo mês"
            onClick={() => irPara(addMonths(refDate, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block size-2.5 rounded-sm',
              CANAL_LEGENDA.full_ml,
            )}
          />
          Full ML
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-block size-2.5 rounded-sm',
              CANAL_LEGENDA.full_shopee,
            )}
          />
          Full Shopee
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-primary/60 inline-block size-2.5 rounded-sm" />
          OP com prazo
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border">
        {/* Cabeçalho dos dias da semana */}
        <div className="bg-muted/40 grid grid-cols-7 border-b">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grade de dias */}
        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const ymd = format(dia, 'yyyy-MM-dd')
            const noMes = isSameMonth(dia, refDate)
            const isHoje = ymd === hojeYmd
            const evs = eventosPorDia.get(ymd) ?? []
            const dayOps = opsPorDia.get(ymd) ?? []
            const dayParcelas = parcelasPorDia.get(ymd) ?? []

            return (
              <div
                key={ymd}
                className={cn(
                  'group/cell min-h-24 border-r border-b p-1.5 last:border-r-0 sm:min-h-28',
                  !noMes && 'bg-muted/20 text-muted-foreground',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                      isHoje && 'bg-primary text-primary-foreground font-semibold',
                    )}
                  >
                    {format(dia, 'd')}
                  </span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => setNovoDia(ymd)}
                      aria-label={`Agendar Full em ${format(dia, 'dd/MM')}`}
                      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md p-0.5 opacity-0 transition-opacity group-hover/cell:opacity-100 focus-visible:opacity-100"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="mt-1 space-y-1">
                  {evs.map((e) => (
                    <EventoChip
                      key={e.id}
                      evento={e}
                      // Manual que já virou remessa: a marca não impede nada,
                      // só diz que existem duas marcas pro mesmo envio — e
                      // deixa o excluir do manual à mão.
                      duplicado={
                        !e.remessa && ehEventoDuplicado(e, remessasDoMes)
                      }
                      podeEditar={podeEditar}
                    />
                  ))}
                  {dayParcelas.map((p) => (
                    <ParcelaChip key={p.id} parcela={p} />
                  ))}
                  {dayOps.map((o) => (
                    <div
                      key={o.id}
                      title={`${o.numero} — ${o.produtoNome}`}
                      className={cn(
                        'flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px]',
                        o.atrasada
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-primary/10 text-primary',
                      )}
                    >
                      <span className="truncate font-mono">{o.numero}</span>
                      <span className="truncate opacity-80">{o.produtoNome}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <NovoEventoDialog
        dia={novoDia}
        contas={contas}
        onClose={() => setNovoDia(null)}
      />
    </div>
  )
}

// -----------------------------------------------------------------
// Chip de evento Full (com excluir)
// -----------------------------------------------------------------

function EventoChip({
  evento,
  duplicado = false,
  podeEditar,
}: {
  evento: EventoFullItem
  /** Manual que coincide com uma remessa real (mesmo dia e canal). */
  duplicado?: boolean
  podeEditar: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    startTransition(async () => {
      const result = await excluirEventoFullAction(evento.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Removido')
      router.refresh()
    })
  }

  // Remessa Full real (cadastrada em Ordens): chip clicável que leva pras
  // OPs do Full — sem excluir por aqui (a remessa vive em Ordens).
  if (evento.remessa) {
    return (
      <Link
        // `status=todos`: as OPs de um Full incluem as que já tiveram baixa, e
        // a lista abre em "Abertas" quando a URL não diz nada.
        href={`/ordens?remessaId=${evento.id}&status=todos`}
        title={`${rotuloDoEventoFull(evento.canal, evento.contaNome)} — ${evento.observacao ?? ''}`}
        className={cn(
          'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium hover:opacity-80',
          CANAL_BADGE[evento.canal],
        )}
      >
        <Truck className="size-3 shrink-0" />
        <span className="truncate">
          {rotuloDoEventoFull(
            EVENTO_FULL_CANAL_CURTO[evento.canal],
            evento.contaNome,
          )}
          {evento.observacao ? ` · ${evento.observacao.split(' · ')[0]}` : ''}
        </span>
      </Link>
    )
  }

  return (
    <div
      title={
        duplicado
          ? 'Já existe uma remessa real neste dia e canal — este é o agendamento manual.'
          : (evento.observacao ??
            rotuloDoEventoFull(evento.canal, evento.contaNome))
      }
      className={cn(
        'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium',
        CANAL_BADGE[evento.canal],
        // Duplicata fica DESBOTADA, não escondida: pode ser que sejam dois
        // envios mesmo no mesmo dia, e sumir com o agendamento seria decidir
        // por quem agendou. O excluir continua do lado.
        duplicado && 'opacity-60 line-through',
      )}
    >
      <Truck className="size-3 shrink-0" />
      <span className="truncate">
        {rotuloDoEventoFull(
          EVENTO_FULL_CANAL_CURTO[evento.canal],
          evento.contaNome,
        )}
        {duplicado ? ' · já virou remessa' : ''}
      </span>
      {podeEditar && (
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          aria-label="Remover envio"
          className="ml-auto shrink-0 opacity-60 hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog: novo evento Full
// -----------------------------------------------------------------

function NovoEventoDialog({
  dia,
  contas,
  onClose,
}: {
  dia: string | null
  contas: { id: string; nome: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // A CONTA DECIDE O CANAL — uma escolha em vez de duas. O canal continua no
  // payload só pro caso de não haver conta cadastrada; a action lê o canal da
  // conta quando ela vem.
  const [contaId, setContaId] = useState<string>(contas[0]?.id ?? '')
  const [canal, setCanal] =
    useState<(typeof eventoFullCanalValues)[number]>('full_ml')
  const [observacao, setObservacao] = useState('')

  function salvar() {
    if (!dia) return
    startTransition(async () => {
      const result = await criarEventoFullAction({
        data: dia,
        canal,
        contaId: contaId || null,
        observacao: observacao.trim() || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Agendado')
      setObservacao('')
      setCanal('full_ml')
      router.refresh()
      onClose()
    })
  }

  const dataLabel = dia
    ? format(parse(dia, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", {
        locale: ptBR,
      })
    : ''

  return (
    <Dialog open={dia !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar envio pro Full</DialogTitle>
          <DialogDescription>{dataLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {contas.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="conta-full">Conta</Label>
              <Select
                value={contaId}
                onValueChange={(v) => v && setContaId(v)}
              >
                <SelectTrigger id="conta-full" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                O canal vem da conta — são 3 do Mercado Livre e 3 da Shopee.
              </p>
            </div>
          ) : (
            // Sem conta cadastrada, o caminho antigo continua de pé.
            <div className="space-y-1.5">
              <Label htmlFor="canal-full">Canal</Label>
              <Select
                items={EVENTO_FULL_CANAL_LABEL}
                value={canal}
                onValueChange={(v) =>
                  v && setCanal(v as (typeof eventoFullCanalValues)[number])
                }
              >
                <SelectTrigger id="canal-full" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eventoFullCanalValues.map((c) => (
                    <SelectItem key={c} value={c}>
                      {EVENTO_FULL_CANAL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="obs-full">Observação (opcional)</Label>
            <Textarea
              id="obs-full"
              rows={3}
              placeholder="Ex: lote de peseiras casal + capas 50x50"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} onClick={salvar} disabled={isPending}>
            {'Agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Chip de boleto a receber
// -----------------------------------------------------------------

// ⚠️ SÓ APARECE PRO ADMIN, e não por esconder na tela: pra quem não é admin a
// lista chega VAZIA do servidor (ver `listarParcelasDoPeriodo`).
//
// O estado vem pronto de `situacaoDaParcela` — a mesma função do sino e da
// tela do pedido. Duas contas de "venceu" que discordam é o defeito que
// aquele módulo existe pra evitar.
function ParcelaChip({ parcela }: { parcela: ParcelaAgendaItem }) {
  const atrasada = parcela.situacao.estado === 'atrasada'
  const valor = Number(parcela.valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })

  return (
    <Link
      href={`/pedidos/${parcela.orcamentoId}`}
      title={`Parcela ${parcela.numero}ª do pedido #${parcela.orcamentoNumero} — ${parcela.cliente} — ${valor} (${rotuloDaSituacao(parcela.situacao)})`}
      className={cn(
        'flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium hover:opacity-80',
        atrasada
          ? 'bg-destructive/15 text-destructive'
          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      )}
    >
      <Banknote className="size-3 shrink-0" />
      <span className="truncate">
        {valor} · {parcela.cliente}
      </span>
    </Link>
  )
}
