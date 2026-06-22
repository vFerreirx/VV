'use client'

import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'

import type { RelatorioMensal } from './actions'
import { Logo } from '@/components/brand/logo'
import { MarketplaceTendencia } from '@/components/charts/marketplace-tendencia'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  CONTAS_MARKETPLACE,
  MARKETPLACE_LABEL,
  type Marketplace,
} from '@/lib/validators/vendas'

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoMenos(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mesAtualYYYYMM(): string {
  return hojeISO().slice(0, 7)
}

// Nome do mês ("junho de 2026") a partir de YYYY-MM.
function labelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Intervalo civil de um mês YYYY-MM (1 ao último dia; mês corrente vai até hoje).
function rangeDoMes(mes: string): [string, string] {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fim =
    mes === mesAtualYYYYMM()
      ? hojeISO()
      : isoDe(new Date(y, m, 0))
  return [inicio, fim]
}

// Soma n meses a um YYYY-MM.
function addMes(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function periodoLabel(inicio: string, fim: string): string {
  return inicio === fim ? dataBR(inicio) : `${dataBR(inicio)} a ${dataBR(fim)}`
}

function dataCurta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

function reais(v: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mkLabel(m: string): string {
  return MARKETPLACE_LABEL[m as Marketplace] ?? m
}

const ORDEM_MK = Object.keys(MARKETPLACE_LABEL) as Marketplace[]
const LABEL_CONTA: Record<string, string> = Object.fromEntries(
  CONTAS_MARKETPLACE.map((c) => [c.key, c.label]),
)
const ORDEM_CONTA: Record<string, number> = Object.fromEntries(
  CONTAS_MARKETPLACE.map((c, i) => [c.key, i]),
)

type ContaLinha = {
  conta: string
  marketplace: string
  unidades: number
  faturamento: number
}

// Agrupa as contas por marketplace (na ordem do catálogo), com subtotal.
function agruparPorMarketplace(porConta: ContaLinha[]) {
  return ORDEM_MK.map((mk) => {
    const contas = porConta
      .filter((c) => c.marketplace === mk)
      .sort((a, b) => (ORDEM_CONTA[a.conta] ?? 99) - (ORDEM_CONTA[b.conta] ?? 99))
    return {
      marketplace: mk,
      contas,
      subUn: contas.reduce((s, c) => s + c.unidades, 0),
      subFat: contas.reduce((s, c) => s + c.faturamento, 0),
    }
  }).filter((g) => g.contas.length > 0)
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: '7 dias', range: () => [isoMenos(6), hojeISO()] },
  { label: '30 dias', range: () => [isoMenos(29), hojeISO()] },
  { label: '90 dias', range: () => [isoMenos(89), hojeISO()] },
]

// --- CSV (separador ; e decimal vírgula, pro Excel pt-BR) ---
function dec(v: number): string {
  return v.toFixed(2).replace('.', ',')
}

function baixarCSV(r: RelatorioMensal) {
  const linhas: string[][] = []
  linhas.push([`Relatório — ${periodoLabel(r.inicio, r.fim)}`])
  linhas.push([])
  linhas.push(['Resumo'])
  linhas.push(['Faturamento', dec(r.vendas.faturamento)])
  linhas.push(['Quantidade de vendas', String(r.vendas.unidades)])
  linhas.push(['Ticket médio', dec(r.vendas.ticketMedio)])
  linhas.push(['Dias com venda', String(r.vendas.dias)])
  linhas.push(['Unidades produzidas', String(r.producao.unidades)])
  linhas.push(['Refugo', String(r.producao.refugo)])
  linhas.push(['OPs concluídas', String(r.producao.opsConcluidas)])
  linhas.push([])
  linhas.push(['Vendas por marketplace / conta', 'Vendas', 'Faturamento'])
  for (const g of agruparPorMarketplace(r.porConta)) {
    linhas.push([mkLabel(g.marketplace), String(g.subUn), dec(g.subFat)])
    for (const c of g.contas) {
      linhas.push([
        `  ${LABEL_CONTA[c.conta] ?? c.conta}`,
        String(c.unidades),
        dec(c.faturamento),
      ])
    }
  }
  linhas.push([])
  linhas.push(['Vendas por dia', 'Vendas', 'Faturamento'])
  for (const d of r.porDia) {
    linhas.push([d.data, String(d.unidades), d.faturamento == null ? '' : dec(d.faturamento)])
  }
  linhas.push([])
  linhas.push(['Produção por operador', 'Produzido', 'Refugo'])
  for (const o of r.porOperador) {
    linhas.push([o.operador, String(o.unidades), String(o.refugo)])
  }

  const csv = linhas
    .map((cols) =>
      cols.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';'),
    )
    .join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `relatorio-${r.inicio}_a_${r.fim}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function RelatorioView({ relatorio }: { relatorio: RelatorioMensal }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [geradoEm, setGeradoEm] = useState('')

  const { inicio, fim } = relatorio

  // Carimba "gerado em" e dispara a impressão no próximo frame.
  function imprimir() {
    setGeradoEm(
      new Date().toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    )
    setTimeout(() => window.print(), 60)
  }

  function irPeriodo(de: string, ate: string) {
    const [a, b] = de <= ate ? [de, ate] : [ate, de]
    const params = new URLSearchParams(searchParams.toString())
    params.set('de', a)
    params.set('ate', b)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  // Navegação de mês (◀ Junho 2026 ▶), operando no mês de `inicio`.
  const mesAtualStr = mesAtualYYYYMM()
  const mesSel = inicio.slice(0, 7)
  const ehMesAtual = mesSel === mesAtualStr
  function irParaMes(mes: string) {
    irPeriodo(...rangeDoMes(mes))
  }

  // De/Até com confirmação: estado local sincronizado ao período aplicado.
  const [deLocal, setDeLocal] = useState(inicio)
  const [ateLocal, setAteLocal] = useState(fim)
  const [syncKey, setSyncKey] = useState(`${inicio}|${fim}`)
  if (syncKey !== `${inicio}|${fim}`) {
    setSyncKey(`${inicio}|${fim}`)
    setDeLocal(inicio)
    setAteLocal(fim)
  }
  const pendente = deLocal !== inicio || ateLocal !== fim

  const presetAtivo = PRESETS.find((p) => {
    const [a, b] = p.range()
    return a === inicio && b === fim
  })

  const v = relatorio.vendas
  const p = relatorio.producao

  const kpis = [
    { label: 'Faturamento', valor: reais(v.faturamento) },
    { label: 'Quantidade de vendas', valor: String(v.unidades) },
    { label: 'Ticket médio', valor: reais(v.ticketMedio) },
    { label: 'Unidades produzidas', valor: String(p.unidades) },
    { label: 'OPs concluídas', valor: String(p.opsConcluidas) },
  ]

  return (
    <div className="space-y-6">
      {/* Cabeçalho + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">Relatório</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Fechamento de vendas, produção e faturamento do período.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => baixarCSV(relatorio)}>
            <Download />
            Planilha (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={imprimir}>
            <Printer />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3 print:hidden">
        {/* Navegação de mês + atalhos rápidos */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => irParaMes(addMes(mesSel, -1))}
              disabled={isPending}
              aria-label="Mês anterior"
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize">
              {labelMes(mesSel)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => irParaMes(addMes(mesSel, 1))}
              disabled={isPending || mesSel >= mesAtualStr}
              aria-label="Próximo mês"
            >
              <ChevronRight />
            </Button>
            {!ehMesAtual && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground ml-1 text-xs underline"
                onClick={() => irParaMes(mesAtualStr)}
                disabled={isPending}
              >
                mês atual
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const ativo = presetAtivo?.label === preset.label
              return (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isPending}
                  onClick={() => irPeriodo(...preset.range())}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    ativo
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Período personalizado: escolhe De e Até e clica em Aplicar */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          <span className="text-muted-foreground text-xs">Período:</span>
          <Input
            type="date"
            value={deLocal}
            max={ateLocal}
            disabled={isPending}
            onChange={(e) => e.target.value && setDeLocal(e.target.value)}
            className="h-8 w-auto"
          />
          <span className="text-muted-foreground text-xs">até</span>
          <Input
            type="date"
            value={ateLocal}
            min={deLocal}
            max={hojeISO()}
            disabled={isPending}
            onChange={(e) => e.target.value && setAteLocal(e.target.value)}
            className="h-8 w-auto"
          />
          <Button
            size="sm"
            onClick={() => irPeriodo(deLocal, ateLocal)}
            disabled={isPending || !pendente}
          >
            Aplicar
          </Button>
        </div>
      </div>

      {/* Cabeçalho do documento (só na impressão / PDF) */}
      <div className="hidden print:mb-5 print:block">
        <div className="flex items-end justify-between border-b border-foreground/20 pb-3">
          <div className="flex items-center gap-2.5">
            <Logo variant="mark" className="text-primary size-9" />
            <div className="leading-tight">
              <div className="font-heading text-base font-semibold tracking-[0.18em] uppercase">
                Vanvest
              </div>
              <div className="text-muted-foreground text-[0.6rem] tracking-[0.25em] uppercase">
                Home Decor
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-semibold">Relatório de Vendas</div>
            <div className="text-muted-foreground text-xs">
              Período: {periodoLabel(inicio, fim)}
            </div>
            {geradoEm && (
              <div className="text-muted-foreground text-[0.65rem]">
                Gerado em {geradoEm}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="vv-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:[&>*]:animate-none">
        {kpis.map((k) => (
          <div key={k.label} className="vv-lift rounded-xl border p-4 print:border-foreground/20">
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              {k.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {k.valor}
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico: tendência por conta (segue o período do filtro) */}
      <div className="print:hidden">
        <MarketplaceTendencia inicio={inicio} fim={fim} />
      </div>

      {/* Vendas por marketplace e conta */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Vendas por marketplace</h2>
        {relatorio.porConta.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem vendas registradas no período.
          </p>
        ) : (
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
                {agruparPorMarketplace(relatorio.porConta).map((g) => (
                  <Fragment key={g.marketplace}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell className="font-semibold">
                        {mkLabel(g.marketplace)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {g.subUn}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {reais(g.subFat)}
                      </TableCell>
                    </TableRow>
                    {g.contas.map((c) => (
                      <TableRow key={c.conta}>
                        <TableCell className="text-muted-foreground pl-6">
                          {LABEL_CONTA[c.conta] ?? c.conta}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.unidades}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {reais(c.faturamento)}
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
                    {v.unidades}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {reais(v.faturamento)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </section>

      {/* Produção por operador */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Produção por operador</h2>
        {relatorio.porOperador.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem apontamentos de produção no período.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Produzido</TableHead>
                  <TableHead className="text-right">Refugo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relatorio.porOperador.map((o) => (
                  <TableRow key={o.operador}>
                    <TableCell className="font-medium">{o.operador}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.unidades}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.refugo}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Vendas por dia */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Vendas por dia</h2>
        {relatorio.porDia.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem vendas registradas no período.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relatorio.porDia.map((d) => (
                  <TableRow key={d.data}>
                    <TableCell className="tabular-nums">
                      {dataCurta(d.data)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.unidades}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {reais(d.faturamento)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
