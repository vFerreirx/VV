'use client'

import { PackageOpen } from 'lucide-react'
import Link from 'next/link'

import type { FullProgresso } from './remessas-actions'
import { cn } from '@/lib/utils'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "faltam 5 dias" / "envia hoje" / "atrasado há 2 dias"
function prazoLabel(dataEnvio: string): { texto: string; atrasado: boolean } {
  const hoje = hojeISO()
  const dias = Math.round(
    (Date.parse(`${dataEnvio}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) /
      86_400_000,
  )
  if (dias > 1) return { texto: `faltam ${dias} dias`, atrasado: false }
  if (dias === 1) return { texto: 'envia amanhã', atrasado: false }
  if (dias === 0) return { texto: 'envia hoje', atrasado: false }
  return {
    texto: `atrasado há ${Math.abs(dias)} dia${Math.abs(dias) > 1 ? 's' : ''}`,
    atrasado: true,
  }
}

export function FullsProgresso({ fulls }: { fulls: FullProgresso[] }) {
  if (fulls.length === 0) return null

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">Fulls em andamento</h2>
      <div className="vv-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fulls.map((f) => {
          const pct =
            f.unidades > 0
              ? Math.round((f.produzidas / f.unidades) * 100)
              : 0
          const prazo = prazoLabel(f.dataEnvio)
          const [, m, d] = f.dataEnvio.split('-')
          return (
            <Link
              key={f.id}
              href={`/ordens?remessaId=${f.id}`}
              className="vv-lift block rounded-xl border p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <PackageOpen
                    className={cn(
                      'size-4 shrink-0',
                      prazo.atrasado
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span className="truncate">
                    {CANAL_LABEL_CURTO[f.canal]} · {d}/{m}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    prazo.atrasado
                      ? 'text-destructive font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  {prazo.texto}
                </span>
              </div>

              {/* Barra de progresso (peças produzidas / total) */}
              <div className="mt-3">
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      pct >= 100
                        ? 'bg-emerald-500'
                        : prazo.atrasado
                          ? 'bg-destructive'
                          : 'bg-primary',
                    )}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs tabular-nums">
                  <span>
                    {f.produzidas.toLocaleString('pt-BR')}/
                    {f.unidades.toLocaleString('pt-BR')} un · {pct}%
                  </span>
                  <span>
                    {f.opsProntas}/{f.ops} OPs prontas
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
