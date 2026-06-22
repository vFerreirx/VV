'use client'

import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { salvarVendaDiaAction, type VendaDia } from './actions'
import { ImportarCSVDialog } from './importar-csv-dialog'
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
import {
  MARKETPLACE_LABEL,
  MARKETPLACES_AGRUPADOS,
  marketplaceDaConta,
  type ContaKey,
  type Marketplace,
} from '@/lib/validators/vendas'

type Props = {
  data: string
  vendaDoDia: VendaDia | null
  recentes: VendaDia[]
  podeEditar: boolean
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

function formatarReais(v: string | number | null): string {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Máscara de moeda BRL: digita os números e eles preenchem da direita
// (centavos). Ex.: "123456" → "1.234,56".
function mascararMoeda(valor: string): string {
  const digits = valor.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Converte a máscara ("1.234,56") no decimal que o servidor espera ("1234.56").
function moedaParaDecimal(masked: string): string | undefined {
  const digits = masked.replace(/\D/g, '')
  if (!digits) return undefined
  return (Number(digits) / 100).toFixed(2)
}

// Converte o decimal salvo ("1234.56") na máscara de exibição.
function decimalParaMoeda(dec: string | null): string {
  if (dec == null || dec === '') return ''
  const cents = Math.round(Number(dec) * 100)
  if (!Number.isFinite(cents)) return ''
  return mascararMoeda(String(cents))
}

// Agrupa o detalhamento por marketplace, somando quantidade e faturamento.
function resumoPorMarketplace(venda: VendaDia | null) {
  const acc = new Map<Marketplace, { quantidade: number; faturamento: number }>()
  for (const c of venda?.contas ?? []) {
    const m = marketplaceDaConta(c.conta)
    if (!m) continue
    const cur = acc.get(m) ?? { quantidade: 0, faturamento: 0 }
    cur.quantidade += c.quantidade
    cur.faturamento += Number(c.faturamento ?? 0)
    acc.set(m, cur)
  }
  return [...acc.entries()].map(([marketplace, v]) => ({ marketplace, ...v }))
}

export function VendasView({ data, vendaDoDia, recentes, podeEditar }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)

  const hoje = hojeISO()
  const ehHoje = data === hoje
  const resumo = resumoPorMarketplace(vendaDoDia)

  function irPara(novaData: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (novaData === hoje) params.delete('data')
    else params.set('data', novaData)
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <div className="space-y-6">
      {podeEditar && (
        <div className="flex justify-end">
          <ImportarCSVDialog />
        </div>
      )}

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
              Quantidade de vendas
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

        {resumo.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
              Por marketplace
            </div>
            <div className="space-y-1.5">
              {resumo.map((r) => (
                <div
                  key={r.marketplace}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="font-medium">
                    {MARKETPLACE_LABEL[r.marketplace]}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-4 tabular-nums">
                    <span>{r.quantidade} vendas</span>
                    <span className="w-28 text-right">
                      {formatarReais(r.faturamento || null)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {vendaDoDia?.observacao && (
          <p className="text-muted-foreground mt-4 text-sm">
            {vendaDoDia.observacao}
          </p>
        )}

        {podeEditar && (
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
        )}
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
                  <span>{v.quantidade} vendas</span>
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
// Dialog: registrar/editar venda do dia (detalhe por conta)
// -----------------------------------------------------------------

type CampoConta = { q: string; f: string }

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
  const [valores, setValores] = useState<Record<string, CampoConta>>({})
  const [observacao, setObservacao] = useState('')
  const [dataEdit, setDataEdit] = useState(data)

  // Sincroniza os campos com a venda atual sempre que o dialog abre.
  const [abertoPara, setAbertoPara] = useState<string | null>(null)
  if (open && abertoPara !== data) {
    setAbertoPara(data)
    setDataEdit(data)
    const init: Record<string, CampoConta> = {}
    for (const c of venda?.contas ?? []) {
      init[c.conta] = {
        q: c.quantidade ? String(c.quantidade) : '',
        f: decimalParaMoeda(c.faturamento),
      }
    }
    setValores(init)
    setObservacao(venda?.observacao ?? '')
  }
  if (!open && abertoPara !== null) setAbertoPara(null)

  function set(conta: string, campo: keyof CampoConta, valor: string) {
    const v = campo === 'f' ? mascararMoeda(valor) : valor
    setValores((prev) => {
      const atual = prev[conta] ?? { q: '', f: '' }
      return { ...prev, [conta]: { ...atual, [campo]: v } }
    })
  }

  const totalQtd = Object.values(valores).reduce(
    (s, v) => s + (Number(v.q) || 0),
    0,
  )
  const totalFat = Object.values(valores).reduce(
    (s, v) => s + Number(moedaParaDecimal(v.f) ?? 0),
    0,
  )

  function salvar() {
    const contas = Object.entries(valores)
      .map(([conta, v]) => ({
        conta: conta as ContaKey,
        quantidade: v.q.trim() === '' ? 0 : v.q,
        faturamento: moedaParaDecimal(v.f),
      }))
      .filter((c) => Number(c.quantidade) > 0 || c.faturamento !== undefined)

    startTransition(async () => {
      const result = await salvarVendaDiaAction({
        data: dataEdit,
        observacao: observacao.trim() || undefined,
        contas,
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
    <Dialog
      open={open}
      // Fecha só pelo "X" (close-press) ou "Cancelar" (onClose direto):
      // clique fora e Esc são ignorados.
      disablePointerDismissal
      onOpenChange={(o, details) => {
        if (!o && details.reason === 'close-press') onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-6">
          <DialogTitle>Venda do dia</DialogTitle>
          <DialogDescription className="capitalize">
            {formatarData(dataEdit)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-5 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label htmlFor="v-data">Data</Label>
            <Input
              id="v-data"
              type="date"
              value={dataEdit}
              max={hojeISO()}
              onChange={(e) => setDataEdit(e.target.value || data)}
              disabled={isPending}
              className="h-9"
            />
          </div>

          {MARKETPLACES_AGRUPADOS.map((grupo) => (
            <div key={grupo.marketplace} className="space-y-2">
              <div className="text-sm font-semibold">{grupo.label}</div>
              <div className="space-y-2">
                {grupo.contas.map((conta) => {
                  const v = valores[conta.key] ?? { q: '', f: '' }
                  return (
                    <div
                      key={conta.key}
                      className="grid grid-cols-[1fr_5.5rem_7rem] items-center gap-2"
                    >
                      <Label
                        htmlFor={`q-${conta.key}`}
                        className="text-muted-foreground text-sm font-normal"
                      >
                        {conta.label}
                      </Label>
                      <Input
                        id={`q-${conta.key}`}
                        inputMode="numeric"
                        placeholder="qtd"
                        value={v.q}
                        onChange={(e) =>
                          set(conta.key, 'q', e.target.value.replace(/\D/g, ''))
                        }
                        disabled={isPending}
                        className="h-9"
                      />
                      <div className="relative">
                        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs">
                          R$
                        </span>
                        <Input
                          aria-label={`Faturamento ${grupo.label} ${conta.label}`}
                          inputMode="decimal"
                          placeholder="0,00"
                          value={v.f}
                          onChange={(e) => set(conta.key, 'f', e.target.value)}
                          disabled={isPending}
                          className="h-9 pl-7 text-right"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="v-obs">Observação (opcional)</Label>
            <Textarea
              id="v-obs"
              rows={2}
              placeholder="Algo que valha registrar sobre o dia…"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t p-6 sm:justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-semibold tabular-nums">{totalQtd} vendas</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-semibold tabular-nums">
              {formatarReais(totalFat || null)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={isPending}>
              {isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
