'use client'

// Line chart com unidades produzidas (e refugo) por dia.
// Usa cores derivadas das CSS variables do tema pra respeitar light/dark.

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ProducaoDia } from '@/app/(app)/dashboard/actions'

type Props = {
  data: ProducaoDia[]
}

export function ProducaoChart({ data }: Props) {
  // Formata data abreviada (ex.: "12/05") pra eixo X.
  const formatted = data.map((d) => ({
    ...d,
    label: format(new Date(`${d.dia}T00:00:00`), 'dd/MM', { locale: ptBR }),
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={formatted}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="producaoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.65 0.13 160)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="oklch(0.65 0.13 160)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="refugoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.65 0.18 25)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="oklch(0.65 0.18 25)" stopOpacity={0} />
            </linearGradient>
          </defs>
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
          />
          <YAxis
            stroke="currentColor"
            className="text-muted-foreground text-xs"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
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
          />
          <Legend
            wrapperStyle={{ fontSize: '0.75rem' }}
            iconType="circle"
          />
          <Area
            type="monotone"
            dataKey="produzido"
            name="Produzido"
            stroke="oklch(0.65 0.13 160)"
            strokeWidth={2}
            fill="url(#producaoFill)"
          />
          <Area
            type="monotone"
            dataKey="refugo"
            name="Refugo"
            stroke="oklch(0.65 0.18 25)"
            strokeWidth={2}
            fill="url(#refugoFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
