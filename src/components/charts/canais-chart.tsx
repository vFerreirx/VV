'use client'

// Donut chart de OPs ativas por canal de destino.

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import type { OpsPorCanal } from '@/app/(app)/dashboard/actions'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'

type Props = {
  data: OpsPorCanal[]
}

const CANAL_COLOR: Record<OpsPorCanal['canal'], string> = {
  full_ml: 'oklch(0.65 0.18 50)', // amarelo-amarronzado (ML)
  full_shopee: 'oklch(0.65 0.22 30)', // laranja (Shopee)
  venda_direta: 'oklch(0.65 0.15 160)', // verde
  estoque: 'oklch(0.65 0.04 250)', // cinza azulado
}

export function CanaisChart({ data }: Props) {
  // Recharts não desenha pie vazio — se nada, mostra placeholder.
  const total = data.reduce((sum, d) => sum + d.total, 0)
  if (total === 0) {
    return (
      <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
        Nenhuma OP ativa.
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    label: CANAL_LABEL_CURTO[d.canal],
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={formatted}
            dataKey="total"
            nameKey="label"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={2}
            strokeWidth={0}
          >
            {formatted.map((d) => (
              <Cell key={d.canal} fill={CANAL_COLOR[d.canal]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              color: 'var(--popover-foreground)',
            }}
            formatter={(value, _name, item) => {
              const payload = item.payload as (typeof formatted)[number]
              return [
                `${value} OPs · ${payload.unidades.toLocaleString('pt-BR')} un`,
                payload.label,
              ]
            }}
          />
          <Legend wrapperStyle={{ fontSize: '0.75rem' }} iconType="circle" verticalAlign="bottom" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
