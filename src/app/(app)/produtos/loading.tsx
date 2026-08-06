import { ViewTransition } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

// O esqueleto SAI descendo e o conteudo ENTRA subindo — o par comunica o
// repasse (o placeholder cede lugar ao conteudo de verdade). A saida e
// rapida (150ms) pra nao disputar atencao; a entrada e mais lenta e so
// comeca depois que a saida termina. Ver globals.css.
export default function Loading() {
  return (
    <ViewTransition exit="vt-sai-desce">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-8 flex-1 sm:max-w-xs" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-7 w-32" />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </ViewTransition>
  )
}
