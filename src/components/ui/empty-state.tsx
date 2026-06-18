import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

// Estado vazio padrão: ícone num círculo + título + descrição + ação
// opcional. Mantém o mesmo visual em todas as listas do sistema.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="bg-muted text-muted-foreground mb-3 flex size-11 items-center justify-center rounded-full">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
