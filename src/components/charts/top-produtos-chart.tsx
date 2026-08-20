'use client'

// Bar chart horizontal — top produtos do mês por unidades em OPs.

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { TopProdutoItem } from '@/app/(app)/dashboard/actions'

type Props = {
  data: TopProdutoItem[]
}

export function TopProdutosChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-56 items-center justify-center text-sm">
        Sem OPs no mês.
      </div>
    )
  }

  // Encurta nome pra eixo Y caber.
  const formatted = data.map((d) => ({
    ...d,
    label: d.produtoNome.length > 22 ? d.produtoNome.slice(0, 21) + '…' : d.produtoNome,
  }))

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-border"
            horizontal={false}
          />
          <XAxis
            type="number"
            stroke="currentColor"
            className="text-muted-foreground text-xs"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            stroke="currentColor"
            className="text-muted-foreground text-xs"
            tickLine={false}
            axisLine={false}
            width={130}
          />
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
              const ops = payload.ops
              const v = typeof value === 'number' ? value : Number(value)
              return [
                `${v.toLocaleString('pt-BR')} un · ${ops} OP${ops === 1 ? '' : 's'}`,
                'Produção',
              ]
            }}
          />
          <Bar
            dataKey="unidades"
            name="Unidades"
            fill="oklch(0.81 0.105 95)"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
