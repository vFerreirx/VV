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
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>

        <div className="space-y-2 rounded-lg border p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </ViewTransition>
  )
}
