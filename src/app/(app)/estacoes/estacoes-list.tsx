'use client'

import { Ban, Moon, Pencil, Plus, Sun, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarEstacaoAction,
  criarEstacaoAction,
  excluirEstacaoAction,
  type EstacaoComDetalhes,
  type MaquinaOpcao,
  type OperadorOpcao,
} from './actions'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ESTACAO_CORES } from '@/lib/validators/estacoes'

type Props = {
  estacoes: EstacaoComDetalhes[]
  operadores: OperadorOpcao[]
  maquinas: MaquinaOpcao[]
}

export function EstacoesList({ estacoes, operadores, maquinas }: Props) {
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<EstacaoComDetalhes | null>(null)
  const [excluindo, setExcluindo] = useState<EstacaoComDetalhes | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCriando(true)}>
          <Plus />
          Nova estação
        </Button>
      </div>

      {estacoes.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma estação cadastrada.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setCriando(true)}>
            Criar primeira estação
          </Button>
        </div>
      ) : (
        <div className="vv-stagger grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {estacoes.map((e) => (
            <article
              key={e.id}
              className="bg-card flex flex-col gap-3 rounded-xl border p-4"
              style={
                e.cor ? { borderLeftColor: e.cor, borderLeftWidth: 4 } : undefined
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: e.cor ?? 'var(--muted-foreground)' }}
                  />
                  <h3 className="font-medium">{e.nome}</h3>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditando(e)}
                    aria-label="Editar"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setExcluindo(e)}
                    aria-label="Excluir"
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Sun className="text-amber-500 size-4 shrink-0" />
                  <span className="text-muted-foreground">Dia:</span>
                  <span>{e.operadorDiaNome ?? '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Moon className="size-4 shrink-0 text-indigo-400" />
                  <span className="text-muted-foreground">Noite:</span>
                  <span>{e.operadorNoiteNome ?? '—'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {e.maquinaNomes.length === 0 ? (
                  <span className="text-muted-foreground text-xs">
                    Sem máquinas vinculadas
                  </span>
                ) : (
                  e.maquinaNomes.map((n) => (
                    <Badge key={n} variant="secondary">
                      {n}
                    </Badge>
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <EstacaoDialog
        open={criando}
        onClose={() => setCriando(false)}
        operadores={operadores}
        maquinas={maquinas}
      />
      <EstacaoDialog
        open={editando !== null}
        estacao={editando ?? undefined}
        onClose={() => setEditando(null)}
        operadores={operadores}
        maquinas={maquinas}
      />
      <ExcluirDialog estacao={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog criar/editar
// -----------------------------------------------------------------

function EstacaoDialog({
  open,
  estacao,
  onClose,
  operadores,
  maquinas,
}: {
  open: boolean
  estacao?: EstacaoComDetalhes
  onClose: () => void
  operadores: OperadorOpcao[]
  maquinas: MaquinaOpcao[]
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {open && (
          <EstacaoBody
            key={estacao?.id ?? 'novo'}
            estacao={estacao}
            onClose={onClose}
            operadores={operadores}
            maquinas={maquinas}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EstacaoBody({
  estacao,
  onClose,
  operadores,
  maquinas,
}: {
  estacao?: EstacaoComDetalhes
  onClose: () => void
  operadores: OperadorOpcao[]
  maquinas: MaquinaOpcao[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(estacao)

  const [nome, setNome] = useState(estacao?.nome ?? '')
  const [cor, setCor] = useState<string | undefined>(estacao?.cor ?? undefined)
  const [operadorDiaId, setOperadorDiaId] = useState(
    estacao?.operadorDiaId ?? 'nenhum',
  )
  const [operadorNoiteId, setOperadorNoiteId] = useState(
    estacao?.operadorNoiteId ?? 'nenhum',
  )
  const [maquinaIds, setMaquinaIds] = useState<string[]>(
    estacao?.maquinaIds ?? [],
  )

  const operadoresItems = useMemo(
    () => ({
      nenhum: 'Nenhum',
      ...Object.fromEntries(operadores.map((o) => [o.id, o.nome])),
    }),
    [operadores],
  )

  function toggleMaquina(id: string) {
    setMaquinaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function salvar() {
    startTransition(async () => {
      const input = {
        nome,
        cor,
        operadorDiaId: operadorDiaId === 'nenhum' ? undefined : operadorDiaId,
        operadorNoiteId:
          operadorNoiteId === 'nenhum' ? undefined : operadorNoiteId,
        maquinaIds,
      }
      const result = estacao
        ? await atualizarEstacaoAction(estacao.id, input)
        : await criarEstacaoAction(input)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      router.refresh()
      onClose()
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'Editar estação' : 'Nova estação'}</DialogTitle>
        <DialogDescription>
          Defina a cor, os operadores de dia e noite, e as máquinas do grupo.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto">
        <div className="space-y-1.5">
          <Label htmlFor="est-nome">Nome</Label>
          <Input
            id="est-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex: Estação 1"
            autoFocus
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCor(undefined)}
              disabled={isPending}
              aria-label="Sem cor"
              className={cn(
                'text-muted-foreground flex size-7 items-center justify-center rounded-full border-2',
                !cor ? 'border-foreground' : 'border-border',
              )}
            >
              <Ban className="size-3.5" />
            </button>
            {ESTACAO_CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                disabled={isPending}
                aria-label={`Cor ${c}`}
                style={{ backgroundColor: c }}
                className={cn(
                  'size-7 rounded-full border-2 transition-transform hover:scale-110',
                  cor === c
                    ? 'border-foreground ring-foreground/20 ring-2'
                    : 'border-transparent',
                )}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="est-dia" className="flex items-center gap-1.5">
              <Sun className="text-amber-500 size-4" /> Operador de dia
            </Label>
            <Select
              items={operadoresItems}
              value={operadorDiaId}
              onValueChange={(v) => v && setOperadorDiaId(v)}
              disabled={isPending}
            >
              <SelectTrigger id="est-dia" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum</SelectItem>
                {operadores.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="est-noite" className="flex items-center gap-1.5">
              <Moon className="size-4 text-indigo-400" /> Operador de noite
            </Label>
            <Select
              items={operadoresItems}
              value={operadorNoiteId}
              onValueChange={(v) => v && setOperadorNoiteId(v)}
              disabled={isPending}
            >
              <SelectTrigger id="est-noite" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum</SelectItem>
                {operadores.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>
            Máquinas{' '}
            {maquinaIds.length > 0 && (
              <span className="text-muted-foreground font-normal">
                ({maquinaIds.length})
              </span>
            )}
          </Label>
          {maquinas.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nenhuma máquina cadastrada.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {maquinas.map((m) => {
                const ativo = maquinaIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMaquina(m.id)}
                    disabled={isPending}
                    title={m.codigo}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      ativo
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'hover:bg-accent',
                    )}
                  >
                    {m.nome}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={isPending || nome.trim().length < 2}>
          {isPending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
        </Button>
      </DialogFooter>
    </>
  )
}

// -----------------------------------------------------------------
// Dialog excluir
// -----------------------------------------------------------------

function ExcluirDialog({
  estacao,
  onClose,
}: {
  estacao: EstacaoComDetalhes | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!estacao) return
    startTransition(async () => {
      const result = await excluirEstacaoAction(estacao.id)
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
    <Dialog open={estacao !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir estação?</DialogTitle>
          <DialogDescription>
            &ldquo;{estacao?.nome}&rdquo; será removida. As máquinas voltam a
            ficar sem estação (não são apagadas).
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
