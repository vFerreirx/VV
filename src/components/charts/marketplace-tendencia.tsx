'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import {
  obterTendenciaPeriodo,
  type TendenciaMarketplace,
  type TendenciaMetrica,
} from '@/app/(app)/relatorios/actions'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CONTAS_MARKETPLACE,
  MARKETPLACE_LABEL,
  type Marketplace,
} from '@/lib/validators/vendas'
import { cn } from '@/lib/utils'

// Paleta com cores distintas o suficiente pra até 10 contas.
const CORES = [
  'oklch(0.62 0.19 255)',
  'oklch(0.70 0.16 195)',
  'oklch(0.65 0.18 145)',
  'oklch(0.78 0.14 90)',
  'oklch(0.68 0.19 40)',
  'oklch(0.62 0.22 18)',
  'oklch(0.60 0.20 330)',
  'oklch(0.56 0.18 290)',
  'oklch(0.62 0.09 250)',
  'oklch(0.52 0.04 250)',
]

// key da conta -> "Mercado Livre · Conta 1"
const LABEL_CONTA: Record<string, string> = Object.fromEntries(
  CONTAS_MARKETPLACE.map((c) => [
    c.key,
    `${MARKETPLACE_LABEL[c.marketplace as Marketplace]} · ${c.label}`,
  ]),
)

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function MarketplaceTendencia({
  inicio,
  fim,
}: {
  inicio: string
  fim: string
}) {
  const [metrica, setMetrica] = useState<TendenciaMetrica>('faturamento')
  const [dados, setDados] = useState<TendenciaMarketplace | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())

  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregando(true)
      const r = await obterTendenciaPeriodo(inicio, fim, metrica)
      if (!ativo) return
      setDados(r)
      setSel((prev) => {
        const validos = new Set(
          [...prev].filter((k) => r.contas.some((c) => c.key === k)),
        )
        if (validos.size > 0) return validos
        // padrão: as 4 contas com maior movimento
        return new Set(r.contas.slice(0, 4).map((c) => c.key))
      })
      setCarregando(false)
    }
    void carregar()
    return () => {
      ativo = false
    }
  }, [inicio, fim, metrica])

  const cores = useMemo(() => {
    const m: Record<string, string> = {}
    dados?.contas.forEach((c, i) => {
      m[c.key] = CORES[i % CORES.length]
    })
    return m
  }, [dados])

  function toggle(key: string) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const contas = dados?.contas ?? []

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Tendência por conta</h3>
          <p className="text-muted-foreground text-xs">
            {metrica === 'faturamento' ? 'Faturamento' : 'Vendas'} por dia, por
            conta de marketplace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Métrica */}
          <div className="bg-muted/60 inline-flex rounded-md p-0.5">
            {(
              [
                ['faturamento', 'R$'],
                ['quantidade', 'Qtd'],
              ] as const
            ).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetrica(m)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  metrica === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="mt-4 h-64 w-full">
        {carregando ? (
          <Skeleton className="h-full w-full rounded-lg" />
        ) : contas.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            Sem vendas registradas no período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={dados!.pontos}
              margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-border"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                stroke="currentColor"
                className="text-muted-foreground text-xs"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                stroke="currentColor"
                className="text-muted-foreground text-xs"
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) =>
                  metrica === 'faturamento'
                    ? v >= 1000
                      ? `${(v / 1000).toFixed(0)}k`
                      : String(v)
                    : String(v)
                }
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'var(--popover-foreground)',
                }}
                labelStyle={{ color: 'var(--foreground)', fontWeight: 500 }}
                formatter={(value) =>
                  metrica === 'faturamento'
                    ? formatBRL(Number(value))
                    : Number(value)
                }
              />
              {contas
                .filter((c) => sel.has(c.key))
                .map((c) => (
                  <Line
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    name={LABEL_CONTA[c.key] ?? c.key}
                    stroke={cores[c.key]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legenda / seletor de contas */}
      {contas.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <div className="text-muted-foreground mb-2 text-xs">
            Contas selecionadas {sel.size}/{contas.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contas.map((c) => {
              const ativo = sel.has(c.key)
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle(c.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    ativo
                      ? 'border-border bg-muted/50'
                      : 'border-border text-muted-foreground opacity-60 hover:opacity-100',
                  )}
                >
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: ativo ? cores[c.key] : 'transparent',
                      border: ativo ? undefined : `1.5px solid ${cores[c.key]}`,
                    }}
                  />
                  {LABEL_CONTA[c.key] ?? c.key}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
