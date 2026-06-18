'use client'

import { Factory, Pencil, Power, Trash2, Wrench } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  excluirMaquinaAction,
  trocarStatusAction,
  type MaquinaListItem,
} from './actions'
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

type MaquinaStatus = (typeof maquinaStatusValues)[number]

type Props = {
  maquinas: MaquinaListItem[]
  podeEditar: boolean
}

const STATUS_DOT: Record<MaquinaStatus, string> = {
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
          <MaquinaCard
            key={m.id}
            maquina={m}
            podeEditar={podeEditar}
            onExcluir={() => setExcluindo(m)}
          />
        ))}
      </div>

      <ExcluirDialog maquina={excluindo} onClose={() => setExcluindo(null)} />
    </>
  )
}

// -----------------------------------------------------------------
// Card de máquina
// -----------------------------------------------------------------

function MaquinaCard({
  maquina,
  podeEditar,
  onExcluir,
}: {
  maquina: MaquinaListItem
  podeEditar: boolean
  onExcluir: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function definirStatus(novo: MaquinaStatus) {
    startTransition(async () => {
      const result = await trocarStatusAction(maquina.id, { status: novo })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(STATUS_LABEL[novo])
      router.refresh()
    })
  }

  const emManutencao = maquina.status === 'manutencao'
  const desligada = maquina.status === 'desativada'

  return (
    <article className="vv-lift flex flex-col gap-3 rounded-xl border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'size-2.5 shrink-0 rounded-full',
              STATUS_DOT[maquina.status],
            )}
            title={STATUS_LABEL[maquina.status]}
          />
          <div className="min-w-0">
            <div className="truncate font-medium">{maquina.nome}</div>
            <div className="text-muted-foreground text-xs">
              {STATUS_LABEL[maquina.status]}
            </div>
          </div>
        </div>

        {podeEditar && (
          <div className="flex shrink-0 gap-0.5">
            <Button
              size="icon-sm"
              variant="ghost"
              render={<Link href={`/maquinas/${maquina.id}`} />}
              aria-label="Editar"
            >
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onExcluir}
              aria-label="Excluir"
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {podeEditar && (
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={emManutencao ? 'default' : 'outline'}
            className="flex-1"
            disabled={isPending}
            aria-pressed={emManutencao}
            onClick={() =>
              definirStatus(emManutencao ? 'operando' : 'manutencao')
            }
          >
            <Wrench />
            Manutenção
          </Button>
          <Button
            size="sm"
            variant={desligada ? 'default' : 'outline'}
            className="flex-1"
            disabled={isPending}
            aria-pressed={desligada}
            onClick={() => definirStatus(desligada ? 'operando' : 'desativada')}
          >
            <Power />
            Desligado
          </Button>
        </div>
      )}
    </article>
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
