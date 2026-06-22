'use client'

import { Download, Printer } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import type { RelatorioMensal } from './actions'
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
import { MARKETPLACE_LABEL, type Marketplace } from '@/lib/validators/vendas'

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isoMenos(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function primeiroDoMes(): string {
  return `${hojeISO().slice(0, 7)}-01`
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

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Este mês', range: () => [primeiroDoMes(), hojeISO()] },
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
  linhas.push(['Vendas por marketplace', 'Vendas', 'Faturamento'])
  for (const m of r.porMarketplace) {
    linhas.push([mkLabel(m.marketplace), String(m.unidades), dec(m.faturamento)])
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

  const { inicio, fim } = relatorio

  function irPeriodo(de: string, ate: string) {
    const [a, b] = de <= ate ? [de, ate] : [ate, de]
    const params = new URLSearchParams(searchParams.toString())
    params.set('de', a)
    params.set('ate', b)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

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
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 p-3 print:hidden">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const ativo = presetAtivo?.label === preset.label
            return (
              <button
                key={preset.label}
                type="button"
                disabled={isPending}
                onClick={() => {
                  const [a, b] = preset.range()
                  irPeriodo(a, b)
                }}
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

        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground text-xs">De</span>
          <Input
            type="date"
            value={inicio}
            max={fim}
            disabled={isPending}
            onChange={(e) => e.target.value && irPeriodo(e.target.value, fim)}
            className="h-8 w-auto"
          />
          <span className="text-muted-foreground text-xs">até</span>
          <Input
            type="date"
            value={fim}
            min={inicio}
            max={hojeISO()}
            disabled={isPending}
            onChange={(e) => e.target.value && irPeriodo(inicio, e.target.value)}
            className="h-8 w-auto"
          />
        </div>
      </div>

      {/* Título só na impressão */}
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">
          Relatório — {periodoLabel(inicio, fim)}
        </h1>
        <p className="text-muted-foreground text-sm">Vanvest Home Decor</p>
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

      {/* Vendas por marketplace */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Vendas por marketplace</h2>
        {relatorio.porMarketplace.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem vendas registradas no período.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relatorio.porMarketplace.map((m) => (
                  <TableRow key={m.marketplace}>
                    <TableCell className="font-medium">
                      {mkLabel(m.marketplace)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.unidades}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {reais(m.faturamento)}
                    </TableCell>
                  </TableRow>
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
