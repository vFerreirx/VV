'use client'

import { Factory, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { excluirMaquinaAction, type MaquinaListItem } from './actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { STATUS_LABEL, maquinaStatusValues } from '@/lib/validators/maquinas'

type Props = {
  maquinas: MaquinaListItem[]
  podeEditar: boolean
}

const STATUS_DOT: Record<(typeof maquinaStatusValues)[number], string> = {
  operando: 'bg-emerald-500',
  setup: 'bg-blue-500',
  parada: 'bg-amber-500',
  manutencao: 'bg-orange-600',
  desativada: 'bg-muted-foreground',
}

export function MaquinasGrid({ maquinas, podeEditar }: Props) {
  const [excluindo, setExcluindo] = useState<MaquinaListItem | null>(null)

  if (maquinas.length === 0) {
    return (
      <EmptyState
        icon={Factory}
        title="Nenhuma máquina cadastrada"
        description="Cadastre as máquinas da fábrica pra usar nas estações e nas OPs."
      />
    )
  }

  return (
    <>
      <div className="vv-stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {maquinas.map((m) => (
          <article
            key={m.id}
            className="vv-lift flex items-center justify-between gap-3 rounded-xl border p-3.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={cn('size-2.5 shrink-0 rounded-full', STATUS_DOT[m.status])}
                title={STATUS_LABEL[m.status]}
              />
              <div className="min-w-0">
                <div className="truncate font-medium">{m.nome}</div>
                <div className="text-muted-foreground text-xs">
                  {STATUS_LABEL[m.status]}
                </div>
              </div>
            </div>

            {podeEditar && (
              <div className="flex shrink-0 gap-0.5">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  render={<Link href={`/maquinas/${m.id}`} />}
                  aria-label="Editar"
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setExcluindo(m)}
                  aria-label="Excluir"
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>

      <ExcluirDialog maquina={excluindo} onClose={() => setExcluindo(null)} />
    </>
  )
}

// -----------------------------------------------------------------
// Dialog de exclusão
// -----------------------------------------------------------------

function ExcluirDialog({
  maquina,
  onClose,
}: {
  maquina: MaquinaListItem | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!maquina) return
    startTransition(async () => {
      const result = await excluirMaquinaAction(maquina.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluída')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={maquina !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir máquina?</DialogTitle>
          <DialogDescription>
            {maquina?.nome} será marcada como excluída. As OPs vinculadas
            mantêm a referência histórica.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={excluir} disabled={isPending}>
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
