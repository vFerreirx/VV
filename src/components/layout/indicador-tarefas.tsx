import type { PrioridadeAlerta } from '@/lib/prioridade'
import { cn } from '@/lib/utils'

// Bolinha ao lado de "Tarefas". Sem número e sem contador: é um aviso de que
// existe algo em aberto, não um placar.
//
// ALTA E URGENTE SE DISTINGUEM POR PREENCHIMENTO, NÃO POR MOVIMENTO:
//
//   urgente -> DISCO CHEIO (bg-destructive) + `.pulse-urgente`
//   alta    -> ANEL VAZADO (só borda laranja, miolo transparente)
//
// O pulso é o mesmo das OPs urgentes no kanban e no painel, e é REFORÇO —
// não pode ser a diferença. Com `prefers-reduced-motion` ele não roda (a
// guarda está no globals.css), e se o movimento fosse a única distinção os
// dois estados virariam o mesmo ponto justamente pra quem pediu menos
// animação. Cheio x vazado sobrevive parado, impresso e em preto e branco.
//
// A cor NÃO é nova: laranja e `destructive` são exatamente o que
// PRIORIDADE_BADGE já usa pra alta e urgente nas OPs. Âmbar seria "pedido
// aguardando" e vermelho puro seria "cancelado" — vocabulário ocupado.
export function IndicadorTarefas({
  prioridade,
  className,
}: {
  prioridade: PrioridadeAlerta
  className?: string
}) {
  if (prioridade === null) return null
  const urgente = prioridade === 'urgente'

  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <span
        aria-hidden
        className={cn(
          'size-2.5 rounded-full',
          urgente ? 'bg-destructive pulse-urgente' : 'border-2 border-orange-500 bg-transparent',
        )}
      />
      {/* O leitor de tela não enxerga forma nenhuma: o estado vai em texto. */}
      <span className="sr-only">
        {urgente ? 'Há tarefa urgente em aberto' : 'Há tarefa de prioridade alta em aberto'}
      </span>
    </span>
  )
}
