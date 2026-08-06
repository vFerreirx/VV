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

const SEM_ESTACAO = '__sem__'

// Agrupa as máquinas pela estação (Turma 1/2/3), na ordem das estações;
// máquinas sem estação ficam num grupo no final. A ordem dentro de cada
// grupo segue a listagem (por código: Máquina 1, 2, 3…).
function agruparPorEstacao(maquinas: MaquinaListItem[]) {
  const mapa = new Map<string, MaquinaListItem[]>()
  for (const m of maquinas) {
    const chave = m.estacaoNome ?? SEM_ESTACAO
    const arr = mapa.get(chave)
    if (arr) arr.push(m)
    else mapa.set(chave, [m])
  }
  return Array.from(mapa.entries())
    .sort(([a], [b]) => {
      if (a === SEM_ESTACAO) return 1
      if (b === SEM_ESTACAO) return -1
      return a.localeCompare(b, 'pt-BR', { numeric: true })
    })
    .map(([chave, ops]) => ({
      estacao: chave === SEM_ESTACAO ? null : chave,
      maquinas: ops,
    }))
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

  const grupos = agruparPorEstacao(maquinas)

  return (
    <>
      <div className="space-y-6">
        {grupos.map((g) => (
          <section key={g.estacao ?? SEM_ESTACAO} className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">
                {g.estacao ?? 'Sem estação'}
              </h2>
              <span className="text-muted-foreground text-xs">
                {g.maquinas.length}{' '}
                {g.maquinas.length === 1 ? 'máquina' : 'máquinas'}
              </span>
            </div>
            <div className="vv-stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {g.maquinas.map((m) => (
                <MaquinaCard
                  key={m.id}
                  maquina={m}
                  podeEditar={podeEditar}
                  onExcluir={() => setExcluindo(m)}
                />
              ))}
            </div>
          </section>
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
          <Button loading={isPending} variant="destructive" onClick={excluir} disabled={isPending}>
            {'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
