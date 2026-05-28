'use client'

import { Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Barra fixa que aparece em cima da lista quando há seleções.
// Mostra a contagem e botões de ação em massa (hoje só Excluir).
export function BulkActionBar({
  count,
  onClear,
  onDelete,
  disabled,
  className,
}: {
  count: number
  onClear: () => void
  onDelete: () => void
  disabled?: boolean
  className?: string
}) {
  if (count === 0) return null

  return (
    <div
      className={cn(
        'border-primary/30 bg-primary/5 sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        disabled={disabled}
        aria-label="Limpar seleção"
      >
        <X />
      </Button>
      <span className="text-sm font-medium tabular-nums">
        {count} selecionado{count === 1 ? '' : 's'}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 />
          Excluir
        </Button>
      </div>
    </div>
  )
}
