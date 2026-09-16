'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CircleAlert } from 'lucide-react'
import { useState } from 'react'

import type { OpUrgenteItem } from './actions'
import { OpDetailSheet } from '@/app/(app)/producao/op-detail-sheet'
import { Badge } from '@/components/ui/badge'
import { PRIORIDADE_BADGE } from '@/lib/prioridade'
import { cn } from '@/lib/utils'
import { PRIORIDADE_LABEL, STATUS_LABEL_CURTO } from '@/lib/validators/ordens'

// A LISTA ABRE A FICHA DA OP ALI MESMO, como /ordens, /remessas e /fabrica.
// Antes ia pra /ordens/[id], que é a tela de EDIÇÃO: o gerente saía do painel
// pra ler uma OP e voltava pra achar onde estava.
export function OpsUrgentesLista({
  ops,
  gestor,
  podeMover,
  podeEditarOrdens,
}: {
  ops: OpUrgenteItem[]
  gestor: boolean
  podeMover: boolean
  podeEditarOrdens: boolean
}) {
  const [aberta, setAberta] = useState<string | null>(null)

  if (ops.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhuma OP urgente ou atrasada.
      </p>
    )
  }

  return (
    <>
      <ul className="divide-y">
        {ops.map((op) => (
          <li key={op.id}>
            <button
              type="button"
              onClick={() => setAberta(op.id)}
              className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left"
            >
              <span className="font-mono text-xs">{op.numero}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {op.produtoNome}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {[op.variacaoCor, op.variacaoTamanho]
                    .filter(Boolean)
                    .join(' / ') || op.produtoSku}
                  {op.maquinaNome && ` · ${op.maquinaNome}`}
                </div>
              </div>
              <Badge
                className={cn(
                  'shrink-0',
                  PRIORIDADE_BADGE[op.prioridade],
                  op.prioridade === 'urgente' && 'pulse-urgente',
                )}
              >
                {PRIORIDADE_LABEL[op.prioridade]}
              </Badge>
              <Badge variant="secondary" className="shrink-0">
                {STATUS_LABEL_CURTO[op.status]}
              </Badge>
              {op.dataPrevistaFim && (
                <span
                  className={cn(
                    'hidden shrink-0 items-center gap-1 text-xs tabular-nums sm:inline-flex',
                    op.atrasada
                      ? 'text-destructive font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  {op.atrasada && <CircleAlert className="size-3.5" />}
                  {format(new Date(op.dataPrevistaFim), 'dd/MM/yy', {
                    locale: ptBR,
                  })}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <OpDetailSheet
        ordemId={aberta}
        onClose={() => setAberta(null)}
        gestor={gestor}
        podeMover={podeMover}
        podeEditarOrdens={podeEditarOrdens}
      />
    </>
  )
}
