'use client'

import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import type { RelatorioMensal } from './actions'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MARKETPLACE_LABEL, type Marketplace } from '@/lib/validators/vendas'

function mesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMes(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function labelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
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

// --- CSV (separador ; e decimal vírgula, pro Excel pt-BR) ---
function dec(v: number): string {
  return v.toFixed(2).replace('.', ',')
}

function baixarCSV(r: RelatorioMensal) {
  const linhas: string[][] = []
  linhas.push([`Relatório mensal — ${labelMes(r.mes)}`])
  linhas.push([])
  linhas.push(['Resumo'])
  linhas.push(['Faturamento', dec(r.vendas.faturamento)])
  linhas.push(['Unidades vendidas', String(r.vendas.unidades)])
  linhas.push(['Ticket médio', dec(r.vendas.ticketMedio)])
  linhas.push(['Dias com venda', String(r.vendas.dias)])
  linhas.push(['Unidades produzidas', String(r.producao.unidades)])
  linhas.push(['Refugo', String(r.producao.refugo)])
  linhas.push(['OPs concluídas', String(r.producao.opsConcluidas)])
  linhas.push([])
  linhas.push(['Vendas por marketplace', 'Unidades', 'Faturamento'])
  for (const m of r.porMarketplace) {
    linhas.push([mkLabel(m.marketplace), String(m.unidades), dec(m.faturamento)])
  }
  linhas.push([])
  linhas.push(['Vendas por dia', 'Unidades', 'Faturamento'])
  for (const d of r.porDia) {
    linhas.push([d.data, String(d.unidades), d.faturamento == null ? '' : dec(d.faturamento)])
  }
  linhas.push([])
  linhas.push(['Produção por operador', 'Unidades', 'Refugo'])
  for (const o of r.porOperador) {
    linhas.push([o.operador, String(o.unidades), String(o.refugo)])
  }

  const csv = linhas
    .map((cols) =>
      cols.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';'),
    )
    .join('\r\n')

  // BOM pro Excel reconhecer acentos.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `relatorio-${r.mes}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function RelatorioView({ relatorio }: { relatorio: RelatorioMensal }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const mes = relatorio.mes
  const atual = mesAtual()
  const ehAtual = mes === atual

  function irPara(novoMes: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (novoMes === atual) params.delete('mes')
    else params.set('mes', novoMes)
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname))
  }

  const v = relatorio.vendas
  const p = relatorio.producao

  const kpis = [
    { label: 'Faturamento', valor: reais(v.faturamento) },
    { label: 'Unidades vendidas', valor: String(v.unidades) },
    { label: 'Ticket médio', valor: reais(v.ticketMedio) },
    { label: 'Unidades produzidas', valor: String(p.unidades) },
    { label: 'OPs concluídas', valor: String(p.opsConcluidas) },
  ]

  return (
    <div className="space-y-6">
      {/* Cabeçalho + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">Relatório mensal</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Fechamento de vendas, produção e faturamento do mês.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => baixarCSV(relatorio)}
          >
            <Download />
            Planilha (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer />
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Navegação de mês */}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => irPara(addMes(mes, -1))}
          disabled={isPending}
          aria-label="Mês anterior"
        >
          <ChevronLeft />
        </Button>
        <div className="text-center">
          <div className="text-sm font-medium capitalize">{labelMes(mes)}</div>
          {!ehAtual && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline"
              onClick={() => irPara(atual)}
              disabled={isPending}
            >
              Mês atual
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => irPara(addMes(mes, 1))}
          disabled={isPending || ehAtual}
          aria-label="Próximo mês"
        >
          <ChevronRight />
        </Button>
      </div>

      {/* Título só na impressão */}
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">
          Relatório mensal — <span className="capitalize">{labelMes(mes)}</span>
        </h1>
        <p className="text-muted-foreground text-sm">Vanvest Home Decor</p>
      </div>

      {/* KPIs */}
      <div className="vv-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:[&>*]:animate-none">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border p-4">
            <div className="text-muted-foreground text-xs tracking-wide uppercase">
              {k.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {k.valor}
            </div>
          </div>
        ))}
      </div>

      {/* Vendas por marketplace */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Vendas por marketplace</h2>
        {relatorio.porMarketplace.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem vendas registradas no mês.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
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
            Sem apontamentos de produção no mês.
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
            Sem vendas registradas no mês.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
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
