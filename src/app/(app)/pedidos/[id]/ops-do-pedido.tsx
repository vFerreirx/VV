// AS OPs QUE PRODUZEM OS FALTANTES DESTE PEDIDO — o "Produzir" da via de
// faltantes. Sem isto, o pedido não sabia se alguém já tinha mandado fazer a
// peça que faltou.
//
// A etapa usa o MESMO rótulo do kanban (`STATUS_LABEL_CURTO`). A OP
// cancelada aparece esmaecida — diz que alguém já tentou —; a excluída nem
// chega aqui (`listarOpsDoPedido`).

import type { OpDoPedido } from '../actions'
import { tituloDaOp } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'
import { STATUS_LABEL_CURTO } from '@/lib/validators/ordens'

export function ListaDeOpsDoPedido({ ops }: { ops: OpDoPedido[] }) {
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {ops.map((op) => {
        const t = tituloDaOp(op.produtoNome, {
          cor: op.variacaoCor,
          modelo: op.variacaoModelo,
          tamanho: op.variacaoTamanho,
        })
        const cancelada = op.status === 'cancelado'
        return (
          <li
            key={op.id}
            className={cn(
              'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2',
              cancelada && 'opacity-60',
            )}
          >
            <span className="min-w-0">
              <span className="font-mono text-xs tabular-nums">{op.numero}</span>{' '}
              <span className="font-medium">{t.familia}</span>
              {t.variacao && <span className="text-muted-foreground"> · {t.variacao}</span>}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {op.quantidade} peças ·{' '}
              <span className={cn(!cancelada && 'text-foreground font-medium')}>
                {cancelada ? 'Cancelada' : STATUS_LABEL_CURTO[op.status]}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function OpsDoPedido({ ops }: { ops: OpDoPedido[] }) {
  if (ops.length === 0) return null
  return (
    <section className="mx-auto max-w-3xl space-y-2 print:hidden">
      <h2 className="text-sm font-semibold">Produção dos faltantes</h2>
      <ListaDeOpsDoPedido ops={ops} />
    </section>
  )
}
