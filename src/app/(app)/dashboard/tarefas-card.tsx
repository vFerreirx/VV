'use client'

import { CalendarClock, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { concluirTarefaAction, type TarefaComContexto } from '../tarefas/actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  PRIORIDADE_BADGE,
  PRIORIDADE_LABEL,
  ehDestaque,
} from '@/lib/prioridade'
import { cn } from '@/lib/utils'
import { estaVencida } from '@/lib/validators/tarefas'

// Bloco de tarefas do painel. Só é renderizado pra admin (a página decide);
// pros demais cargos o dashboard não muda em nada.
export function TarefasCard({
  tarefas,
  total,
}: {
  tarefas: TarefaComContexto[]
  total: number
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Tarefas pendentes</CardTitle>
          <Link
            href="/tarefas"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Ver todas →
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {tarefas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma tarefa pendente.
          </p>
        ) : (
          <>
            <ul className="divide-y">
              {tarefas.map((t) => (
                <LinhaPainel key={t.id} tarefa={t} />
              ))}
            </ul>
            {total > tarefas.length && (
              <p className="text-muted-foreground mt-3 text-xs">
                e mais {total - tarefas.length} pendente
                {total - tarefas.length > 1 ? 's' : ''}.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function LinhaPainel({ tarefa: t }: { tarefa: TarefaComContexto }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const vencida = estaVencida(t.prazo)

  function concluir() {
    startTransition(async () => {
      const r = await concluirTarefaAction(t.id)
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success('Tarefa concluída')
      router.refresh()
    })
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Checkbox
        checked={false}
        onCheckedChange={concluir}
        disabled={isPending}
        aria-label={`Concluir ${t.titulo}`}
      />
      <div className="min-w-0 flex-1">
        {/* O selo fica FORA do `truncate`: dentro dele um título longo
            empurraria o selo pra fora da vista, e é justamente na tarefa
            urgente que o título costuma ser comprido. */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{t.titulo}</span>
          {/* Mesmo selo da tela de tarefas: o painel reordena por prioridade
              efetiva, e sem o selo ninguém entende por que aquela subiu. */}
          {ehDestaque(t.prioridadeEfetiva) && (
            <Badge
              title={
                t.escalou
                  ? `Subiu sozinha pelo prazo (marcada como ${PRIORIDADE_LABEL[t.prioridade]})`
                  : undefined
              }
              className={cn(
                'inline-flex shrink-0 items-center gap-1 text-[11px]',
                PRIORIDADE_BADGE[t.prioridadeEfetiva],
                t.prioridadeEfetiva === 'urgente' && 'pulse-urgente',
              )}
            >
              {t.escalou && <CalendarClock className="size-3" />}
              {PRIORIDADE_LABEL[t.prioridadeEfetiva]}
            </Badge>
          )}
        </div>
        {/* No telefone não cabe o badge à direita; aqui embaixo cabe. */}
        {t.contaNome && (
          <div className="text-muted-foreground truncate text-xs sm:hidden">
            {t.contaNome}
          </div>
        )}
      </div>
      {t.contaNome && (
        <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
          {t.contaNome}
        </Badge>
      )}
      {t.prazo && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 text-xs tabular-nums',
            vencida ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}
        >
          {vencida ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <CalendarClock className="size-3.5" />
          )}
          {t.prazo.split('-').reverse().join('/').slice(0, 5)}
        </span>
      )}
    </li>
  )
}
