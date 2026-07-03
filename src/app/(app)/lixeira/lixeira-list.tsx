'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArchiveRestore,
  Combine,
  Factory,
  Grid2x2,
  ListChecks,
  Package,
  Palette,
  Ruler,
  Shapes,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  restaurarAction,
  type ItemLixeira,
  type TipoLixeira,
} from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

const ICONE: Record<TipoLixeira, LucideIcon> = {
  produto: Package,
  op: ListChecks,
  kit: Combine,
  cor: Palette,
  modelo: Shapes,
  tamanho: Ruler,
  maquina: Factory,
  estacao: Grid2x2,
}

const TIPO_LABEL: Record<TipoLixeira, string> = {
  produto: 'Produto',
  op: 'OP',
  kit: 'Kit',
  cor: 'Cor',
  modelo: 'Modelo',
  tamanho: 'Tamanho',
  maquina: 'Máquina',
  estacao: 'Estação',
}

export function LixeiraList({ itens }: { itens: ItemLixeira[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null)

  function restaurar(item: ItemLixeira) {
    setRestaurandoId(item.id)
    startTransition(async () => {
      const result = await restaurarAction(item.tipo, item.id)
      setRestaurandoId(null)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(`${TIPO_LABEL[item.tipo]} "${item.titulo}" restaurado`)
      router.refresh()
    })
  }

  if (itens.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        title="Lixeira vazia"
        description="Nada foi excluído — ou tudo que foi já voltou."
      />
    )
  }

  return (
    <div className="divide-y rounded-lg border">
      {itens.map((item) => {
        const Icone = ICONE[item.tipo]
        return (
          <div
            key={`${item.tipo}-${item.id}`}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <Icone className="text-muted-foreground size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{item.titulo}</div>
              <div className="text-muted-foreground truncate text-xs">
                {item.subtitulo} · excluído em{' '}
                {format(new Date(item.excluidoEm), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {TIPO_LABEL[item.tipo]}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => restaurar(item)}
              disabled={isPending}
            >
              <ArchiveRestore />
              {restaurandoId === item.id ? 'Restaurando…' : 'Restaurar'}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
