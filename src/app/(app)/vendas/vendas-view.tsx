'use client'

import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { salvarVendaDiaAction, type VendaDia } from './actions'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  data: string
  vendaDoDia: VendaDia | null
  recentes: VendaDia[]
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Soma/subtrai dias de uma data YYYY-MM-DD sem fuso (meio-dia UTC).
function addDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
  })
}

function formatarDataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

function formatarReais(v: string | null): string {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function VendasView({ data, vendaDoDia, recentes }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)

  const hoje = hojeISO()
  const ehHoje = data === hoje

  function irPara(novaData: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (novaData === hoje) params.delete('data')
    else params.set('data', novaData)
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <div className="space-y-6">
      {/* Navegação de dia */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => irPara(addDias(data, -1))}
          disabled={isPending}
          aria-label="Dia anterior"
        >
          <ChevronLeft />
        </Button>

        <div className="text-center">
          <div className="text-sm font-medium capitalize">
            {formatarData(data)}
          </div>
          {!ehHoje && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline"
              onClick={() => irPara(hoje)}
              disabled={isPending}
            >
              Voltar pra hoje
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => irPara(addDias(data, 1))}
          disabled={isPending || ehHoje}
          aria-label="Próximo dia"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Card do dia */}
      <div className="rounded-xl border p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              Unidades vendidas
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {vendaDoDia?.quantidade ?? 0}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              Faturamento
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {formatarReais(vendaDoDia?.faturamento ?? null)}
            </div>
          </div>
        </div>

        {vendaDoDia?.observacao && (
          <p className="text-muted-foreground mt-4 text-sm">
            {vendaDoDia.observacao}
          </p>
        )}

        <div className="mt-6">
          <Button onClick={() => setEditando(true)} disabled={isPending}>
            {vendaDoDia ? (
              <>
                <Pencil />
                Editar
              </>
            ) : (
              <>
                <Plus />
                Registrar venda do dia
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Dias recentes */}
      {recentes.length > 0 && (
        <div>
          <h2 className="text-muted-foreground mb-2 text-sm font-medium">
            Dias recentes
          </h2>
          <div className="divide-y rounded-lg border">
            {recentes.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => irPara(v.data)}
                disabled={isPending}
                className="hover:bg-muted/50 flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm"
              >
                <span className="font-medium tabular-nums">
                  {formatarDataCurta(v.data)}
                </span>
                <span className="text-muted-foreground flex items-center gap-4 tabular-nums">
                  <span>{v.quantidade} un.</span>
                  <span className="w-24 text-right">
                    {formatarReais(v.faturamento)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <EditarDialog
        open={editando}
        onClose={() => setEditando(false)}
        data={data}
        venda={vendaDoDia}
      />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog: registrar/editar venda do dia
// -----------------------------------------------------------------

function EditarDialog({
  open,
  onClose,
  data,
  venda,
}: {
  open: boolean
  onClose: () => void
  data: string
  venda: VendaDia | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [quantidade, setQuantidade] = useState('')
  const [faturamento, setFaturamento] = useState('')
  const [observacao, setObservacao] = useState('')

  // Sincroniza os campos com a venda atual sempre que o dialog abre.
  const [abertoPara, setAbertoPara] = useState<string | null>(null)
  if (open && abertoPara !== data) {
    setAbertoPara(data)
    setQuantidade(venda ? String(venda.quantidade) : '')
    setFaturamento(venda?.faturamento ?? '')
    setObservacao(venda?.observacao ?? '')
  }
  if (!open && abertoPara !== null) setAbertoPara(null)

  function salvar() {
    startTransition(async () => {
      const result = await salvarVendaDiaAction({
        data,
        quantidade: quantidade.trim() === '' ? 0 : quantidade,
        faturamento: faturamento.trim() || undefined,
        observacao: observacao.trim() || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Venda do dia</DialogTitle>
          <DialogDescription className="capitalize">
            {formatarData(data)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="v-qtd">Unidades vendidas</Label>
            <Input
              id="v-qtd"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              placeholder="0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-fat">Faturamento do dia (R$)</Label>
            <Input
              id="v-fat"
              inputMode="decimal"
              placeholder="0,00"
              value={faturamento}
              onChange={(e) => setFaturamento(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-obs">Observação (opcional)</Label>
            <Textarea
              id="v-obs"
              rows={3}
              placeholder="Algo que valha registrar sobre o dia…"
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
          <Button onClick={salvar} disabled={isPending}>
            {isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
