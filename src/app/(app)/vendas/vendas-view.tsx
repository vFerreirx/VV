'use client'

import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useRef, useState, useTransition } from 'react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  CONTAS_MARKETPLACE,
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

// Ordem dos marketplaces e das contas vem do catálogo (igual à aba Mensal).
const ORDEM_MK = Object.keys(MARKETPLACE_LABEL) as Marketplace[]
const LABEL_CONTA: Record<string, string> = Object.fromEntries(
  CONTAS_MARKETPLACE.map((c) => [c.key, c.label]),
)
const ORDEM_CONTA: Record<string, number> = Object.fromEntries(
  CONTAS_MARKETPLACE.map((c, i) => [c.key, i]),
)

// Agrupa as contas do dia por marketplace (na ordem do catálogo), com
// subtotal por marketplace — mesmo formato da aba Mensal.
function agruparContasDoDia(venda: VendaDia | null) {
  const linhas = (venda?.contas ?? []).map((c) => ({
    conta: c.conta,
    marketplace: marketplaceDaConta(c.conta),
    quantidade: c.quantidade,
    faturamento: Number(c.faturamento ?? 0),
  }))
  return ORDEM_MK.map((mk) => {
    const contas = linhas
      .filter((c) => c.marketplace === mk)
      .sort((a, b) => (ORDEM_CONTA[a.conta] ?? 99) - (ORDEM_CONTA[b.conta] ?? 99))
    return {
      marketplace: mk,
      contas,
      subQtd: contas.reduce((s, c) => s + c.quantidade, 0),
      subFat: contas.reduce((s, c) => s + c.faturamento, 0),
    }
  }).filter((g) => g.contas.length > 0)
}

export function VendasView({ data, vendaDoDia, recentes, podeEditar }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  // Dialog de registro/edição: guarda o dia-alvo e a venda existente (ou
  // null pra um registro novo). null = fechado.
  const [registro, setRegistro] = useState<{
    data: string
    venda: VendaDia | null
  } | null>(null)

  const hoje = hojeISO()
  const ehHoje = data === hoje
  const grupos = agruparContasDoDia(vendaDoDia)

  // "Registrar venda" (topo) sempre lança um dia NOVO: o dia seguinte ao
  // último dia com venda lançada (recentes vem ordenado por data desc).
  // Sem nenhuma venda ainda, cai pra hoje.
  const proximoDiaSemDados = recentes.length > 0 ? addDias(recentes[0]!.data, 1) : hoje

  const seletorDiaRef = useRef<HTMLInputElement>(null)

  function irPara(novaData: string) {
    // Sempre fixa ?data: sem ele, a página abriria no último dia com
    // vendas, então "Voltar pra hoje" precisa do parâmetro explícito.
    const params = new URLSearchParams(searchParams.toString())
    params.set('data', novaData)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  // Abre o calendário nativo do input escondido (fallback: foco).
  function abrirSeletorDia() {
    const el = seletorDiaRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  return (
    <div className="space-y-6">
      {podeEditar && (
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => setRegistro({ data: proximoDiaSemDados, venda: null })}
            disabled={isPending}
          >
            <Plus />
            Registrar venda
          </Button>
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

        <div className="flex flex-col items-center gap-1">
          <div className="text-sm font-medium capitalize">{formatarData(data)}</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
              onClick={abrirSeletorDia}
              disabled={isPending}
            >
              <CalendarDays className="size-3.5" />
              Selecionar dia
            </button>
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
          {/* Input escondido que dispara o date picker nativo. */}
          <input
            ref={seletorDiaRef}
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => e.target.value && irPara(e.target.value)}
            disabled={isPending}
            tabIndex={-1}
            aria-hidden
            className="sr-only"
          />
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
            <div className="text-muted-foreground text-xs tracking-wide uppercase">Faturamento</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {formatarReais(vendaDoDia?.faturamento ?? null)}
            </div>
          </div>
        </div>

        {grupos.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <div className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
              Por marketplace / conta
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Marketplace / conta</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Faturamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map((g) => (
                    <Fragment key={g.marketplace}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell className="font-semibold">
                          {MARKETPLACE_LABEL[g.marketplace]}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {g.subQtd}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatarReais(g.subFat || null)}
                        </TableCell>
                      </TableRow>
                      {g.contas.map((c) => (
                        <TableRow key={c.conta}>
                          <TableCell className="text-muted-foreground pl-6">
                            {LABEL_CONTA[c.conta] ?? c.conta}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.quantidade}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatarReais(c.faturamento || null)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {vendaDoDia?.quantidade ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatarReais(vendaDoDia?.faturamento ?? null)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        )}

        {vendaDoDia?.observacao && (
          <p className="text-muted-foreground mt-4 text-sm">{vendaDoDia.observacao}</p>
        )}

        {podeEditar && (
          <div className="mt-6">
            <Button onClick={() => setRegistro({ data, venda: vendaDoDia })} disabled={isPending}>
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
          <h2 className="text-muted-foreground mb-2 text-sm font-medium">Dias recentes</h2>
          <div className="divide-y rounded-lg border">
            {recentes.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => irPara(v.data)}
                disabled={isPending}
                className="hover:bg-muted/50 flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm"
              >
                <span className="font-medium tabular-nums">{formatarDataCurta(v.data)}</span>
                <span className="text-muted-foreground flex items-center gap-4 tabular-nums">
                  <span>{v.quantidade} vendas</span>
                  <span className="w-24 text-right">{formatarReais(v.faturamento)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <EditarDialog
        open={registro !== null}
        onClose={() => setRegistro(null)}
        data={registro?.data ?? data}
        venda={registro?.venda ?? null}
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

  const totalQtd = Object.values(valores).reduce((s, v) => s + (Number(v.q) || 0), 0)
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
          <DialogDescription className="capitalize">{formatarData(dataEdit)}</DialogDescription>
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
                        onChange={(e) => set(conta.key, 'q', e.target.value.replace(/\D/g, ''))}
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
            <span className="font-semibold tabular-nums">{formatarReais(totalFat || null)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button loading={isPending} onClick={salvar} disabled={isPending}>
              {'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
