'use client'

import { AlertTriangle, ChevronDown, PackageSearch } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import type { EtapaKanban, OpDaRemessa, RemessaAberta } from './actions'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CANAL_LABEL_CURTO, STATUS_LABEL_CURTO } from '@/lib/validators/ordens'

// Mesmas cores usadas por etapa no kanban (src/app/(app)/producao/kanban-board.tsx),
// duplicadas aqui pra não importar um componente client grande só por uma constante.
const STATUS_BAR_COLOR: Record<EtapaKanban, string> = {
  aguardando_materia_prima: 'bg-zinc-500',
  programado: 'bg-blue-500',
  em_producao: 'bg-emerald-500',
  acabamento: 'bg-cyan-600',
  embalagem: 'bg-violet-500',
  pronto_envio: 'bg-amber-500',
}

const RISCO_INFO = {
  no_prazo: { label: 'No prazo', badge: 'bg-emerald-500/15 text-emerald-600' },
  em_risco: { label: 'Em risco', badge: 'bg-amber-500/15 text-amber-600' },
  atrasada: { label: 'Atrasada', badge: 'bg-destructive/15 text-destructive' },
} as const

function prazoLabel(diasRestantes: number): string {
  if (diasRestantes < 0) {
    return `atrasado há ${Math.abs(diasRestantes)} dia${Math.abs(diasRestantes) > 1 ? 's' : ''}`
  }
  if (diasRestantes === 0) return 'envia hoje'
  if (diasRestantes === 1) return 'envia amanhã'
  return `faltam ${diasRestantes} dias`
}

type Props = {
  remessas: RemessaAberta[]
  ops: OpDaRemessa[]
}

export function RemessasView({ remessas, ops }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Remessas Full</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {remessas.length} remessa{remessas.length === 1 ? '' : 's'} aberta
          {remessas.length === 1 ? '' : 's'} · ordenadas pelo prazo mais
          próximo
        </p>
      </div>

      {remessas.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          Nenhuma remessa Full aberta no momento.
        </div>
      ) : (
        <div className="space-y-3">
          {remessas.map((r) => (
            <RemessaCard
              key={r.id}
              remessa={r}
              ops={ops.filter((o) => o.remessaFullId === r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RemessaCard({
  remessa: r,
  ops,
}: {
  remessa: RemessaAberta
  ops: OpDaRemessa[]
}) {
  const [aberta, setAberta] = useState(false)
  const pctPecas =
    r.unidades > 0 ? Math.round((r.produzidas / r.unidades) * 100) : 0
  const [, m, d] = r.dataEnvio.split('-')
  const risco = RISCO_INFO[r.risco]

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="hover:bg-muted/30 flex w-full flex-col gap-3 rounded-xl p-4 text-left transition-colors"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <PackageSearch
              className={cn(
                'size-4 shrink-0',
                r.risco === 'atrasada'
                  ? 'text-destructive'
                  : 'text-muted-foreground',
              )}
            />
            {CANAL_LABEL_CURTO[r.canal]} · {d}/{m}
            <span className="text-muted-foreground font-normal">
              · {prazoLabel(r.diasRestantes)}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge className={cn('text-[11px]', risco.badge)}>
              {risco.label}
            </Badge>
            <ChevronDown
              className={cn(
                'text-muted-foreground size-4 transition-transform',
                aberta && 'rotate-180',
              )}
            />
          </span>
        </div>

        {/* Barra segmentada por etapa */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {r.etapas
            .filter((e) => e.count > 0)
            .map((e) => (
              <div
                key={e.status}
                className={STATUS_BAR_COLOR[e.status]}
                style={{ width: `${(e.count / r.ops) * 100}%` }}
                title={`${STATUS_LABEL_CURTO[e.status]}: ${e.count}`}
              />
            ))}
        </div>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="tabular-nums">
            {r.produzidas.toLocaleString('pt-BR')}/
            {r.unidades.toLocaleString('pt-BR')} peças · {pctPecas}%
          </span>
          <span className="tabular-nums">
            {r.opsProntas}/{r.ops} OPs prontas
          </span>
          {r.atrasadas > 0 && (
            <span className="text-destructive inline-flex items-center gap-1 font-medium">
              <AlertTriangle className="size-3" />
              {r.atrasadas} OP{r.atrasadas > 1 ? 's' : ''} atrasada
              {r.atrasadas > 1 ? 's' : ''}
            </span>
          )}
          <span>
            {r.pronta ? (
              <span className="font-medium text-emerald-600">
                Pronta pra despachar
              </span>
            ) : (
              <>
                Travando em:{' '}
                <span className="font-medium">
                  {r.gargalo ? STATUS_LABEL_CURTO[r.gargalo] : '—'}
                </span>
              </>
            )}
          </span>
        </div>
      </button>

      {aberta && (
        <div className="space-y-1.5 border-t p-3">
          {ops.map((o) => (
            <OpRow key={o.id} op={o} gargalo={r.gargalo} />
          ))}
        </div>
      )}
    </div>
  )
}

function OpRow({
  op,
  gargalo,
}: {
  op: OpDaRemessa
  gargalo: EtapaKanban | null
}) {
  const pct =
    op.quantidade > 0 ? Math.round((op.produzido / op.quantidade) * 100) : 0
  const travando = gargalo !== null && op.status === gargalo

  return (
    <Link
      href={`/ordens/${op.id}`}
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors hover:bg-muted/40',
        (travando || op.atrasada) && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 font-medium">
          {op.numero}
          {op.atrasada && (
            <AlertTriangle className="text-destructive size-3" />
          )}
        </span>
        <span className="text-muted-foreground truncate">
          {op.produtoNome}
          {[op.variacaoCor, op.variacaoTamanho].filter(Boolean).length > 0 &&
            ` · ${[op.variacaoCor, op.variacaoTamanho].filter(Boolean).join('/')}`}
        </span>
      </span>
      <span className="text-muted-foreground flex shrink-0 items-center gap-3 tabular-nums">
        <span>{op.quantidade} un</span>
        <span>{pct}%</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px]',
            travando
              ? 'bg-destructive/15 text-destructive font-medium'
              : 'bg-muted',
          )}
        >
          {STATUS_LABEL_CURTO[op.status]}
        </span>
        <span className="w-16 truncate text-right">
          {op.responsavelNome ?? '—'}
        </span>
      </span>
    </Link>
  )
}
