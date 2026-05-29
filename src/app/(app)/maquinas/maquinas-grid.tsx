'use client'

import {
  Cog,
  Pause,
  Pencil,
  Play,
  Trash2,
  User as UserIcon,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  excluirMaquinaAction,
  trocarStatusAction,
  type MaquinaListItem,
} from './actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  STATUS_LABEL,
  STATUS_ORDER,
  maquinaStatusValues,
  type MaquinasFiltros,
} from '@/lib/validators/maquinas'

type Props = {
  maquinas: MaquinaListItem[]
  podeEditar: boolean
  isOperador: boolean
  userId: string
  filtrosIniciais: MaquinasFiltros
}

const STATUS_STYLES: Record<
  (typeof maquinaStatusValues)[number],
  { card: string; dot: string; badge: string }
> = {
  operando: {
    card: 'border-emerald-500/30 bg-emerald-500/5',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500 text-white',
  },
  setup: {
    card: 'border-blue-500/30 bg-blue-500/5',
    dot: 'bg-blue-500',
    badge: 'bg-blue-500 text-white',
  },
  parada: {
    card: 'border-amber-500/30 bg-amber-500/5',
    dot: 'bg-amber-500',
    badge: 'bg-amber-500 text-white',
  },
  manutencao: {
    card: 'border-orange-600/30 bg-orange-500/5',
    dot: 'bg-orange-600',
    badge: 'bg-orange-600 text-white',
  },
  desativada: {
    card: 'border-muted-foreground/30 bg-muted/30',
    dot: 'bg-muted-foreground',
    badge: 'bg-muted-foreground text-background',
  },
}

export function MaquinasGrid({
  maquinas,
  podeEditar,
  isOperador,
  userId,
  filtrosIniciais,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [excluindo, setExcluindo] = useState<MaquinaListItem | null>(null)

  function aplicarFiltro(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === 'todos') params.delete(k)
      else params.set(k, v)
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  // Agrupa por status, mantendo a ordem visual definida.
  const grupos = STATUS_ORDER.map((s) => ({
    status: s,
    maquinas: maquinas.filter((m) => m.status === s),
  })).filter((g) => g.maquinas.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filtrosIniciais.status ?? 'todos'}
          onValueChange={(v) => aplicarFiltro({ status: v ?? undefined })}
        >
          <SelectTrigger size="sm" className="min-w-[10rem]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {maquinaStatusValues.map((s) => (
              <SelectItem key={s} value={s}>
                <div className="flex items-center gap-2">
                  <span
                    className={cn('inline-block size-2 rounded-full', STATUS_STYLES[s].dot)}
                  />
                  {STATUS_LABEL[s]}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {maquinas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma máquina encontrada.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.status}>
              <header className="mb-3 flex items-center gap-2">
                <span
                  className={cn(
                    'inline-block size-2 rounded-full',
                    STATUS_STYLES[g.status].dot,
                  )}
                />
                <h2 className="text-sm font-medium">
                  {STATUS_LABEL[g.status]}
                </h2>
                <span className="text-muted-foreground text-xs">
                  · {g.maquinas.length}
                </span>
              </header>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.maquinas.map((m) => (
                  <MaquinaCard
                    key={m.id}
                    maquina={m}
                    podeEditar={podeEditar}
                    podeAlterarStatus={
                      podeEditar ||
                      (isOperador && m.operadorAtualId === userId)
                    }
                    onExcluir={() => setExcluindo(m)}
                    isPending={isPending}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ExcluirDialog
        maquina={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </div>
  )
}

// -----------------------------------------------------------------
// Card de máquina
// -----------------------------------------------------------------

function MaquinaCard({
  maquina,
  podeEditar,
  podeAlterarStatus,
  onExcluir,
  isPending,
}: {
  maquina: MaquinaListItem
  podeEditar: boolean
  podeAlterarStatus: boolean
  onExcluir: () => void
  isPending: boolean
}) {
  const router = useRouter()
  const [statusPending, startStatusTransition] = useTransition()
  const styles = STATUS_STYLES[maquina.status]

  function alterarStatus(novoStatus: typeof maquina.status) {
    startStatusTransition(async () => {
      const result = await trocarStatusAction(maquina.id, {
        status: novoStatus,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(STATUS_LABEL[novoStatus])
      router.refresh()
    })
  }

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 transition-colors',
        styles.card,
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-base font-semibold">
              {maquina.codigo}
            </h3>
            <Badge className={cn('shrink-0', styles.badge)}>
              {STATUS_LABEL[maquina.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {maquina.nome}
          </p>
        </div>
        {podeEditar && (
          <div className="flex shrink-0 gap-1">
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
              disabled={isPending}
              aria-label="Excluir"
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        )}
      </header>

      <div className="border-foreground/10 flex flex-wrap items-center gap-2 border-t pt-2">
        {maquina.operadorNome ? (
          <>
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">
                {initials(maquina.operadorNome)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-xs">{maquina.operadorNome}</span>
          </>
        ) : (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <UserIcon className="size-3.5" />
            Sem operador
          </span>
        )}
      </div>

      {podeAlterarStatus && (
        <div className="flex flex-wrap gap-1.5">
          <StatusButton
            current={maquina.status}
            target="operando"
            onClick={() => alterarStatus('operando')}
            disabled={statusPending}
            icon={Play}
            label="Operar"
          />
          <StatusButton
            current={maquina.status}
            target="parada"
            onClick={() => alterarStatus('parada')}
            disabled={statusPending}
            icon={Pause}
            label="Parar"
          />
          <StatusButton
            current={maquina.status}
            target="setup"
            onClick={() => alterarStatus('setup')}
            disabled={statusPending}
            icon={Cog}
            label="Setup"
          />
          <StatusButton
            current={maquina.status}
            target="manutencao"
            onClick={() => alterarStatus('manutencao')}
            disabled={statusPending}
            icon={Wrench}
            label="Manut."
          />
        </div>
      )}
    </article>
  )
}

function StatusButton({
  current,
  target,
  onClick,
  disabled,
  icon: Icon,
  label,
}: {
  current: string
  target: string
  onClick: () => void
  disabled: boolean
  icon: typeof Play
  label: string
}) {
  const active = current === target
  return (
    <Button
      size="xs"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      disabled={disabled || active}
      aria-pressed={active}
    >
      <Icon />
      {label}
    </Button>
  )
}

function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
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
            {maquina?.codigo} ({maquina?.nome}) será marcada como excluída e
            desativada. As OPs vinculadas mantêm a referência histórica.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={excluir}
            disabled={isPending}
          >
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
