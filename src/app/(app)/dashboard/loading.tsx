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
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-xl lg:col-span-2" />
          <Skeleton className="h-48 rounded-xl" />
        </div>

        <Skeleton className="h-72 rounded-xl" />
      </div>
    </ViewTransition>
  )
}
