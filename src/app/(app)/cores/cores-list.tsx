'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarCorAction,
  criarCorAction,
  excluirCorAction,
  excluirMultiplasCoresAction,
} from './actions'
import { Badge } from '@/components/ui/badge'
import { BulkActionBar } from '@/components/ui/bulk-action-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Cor } from '@/lib/db/schema'
import { corSchema, type CorInput } from '@/lib/validators/cores'

type Props = {
  cores: Cor[]
  podeEditar: boolean
}

export function CoresList({ cores, podeEditar }: Props) {
  const [editingCor, setEditingCor] = useState<Cor | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Cor | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [bulkExcluindo, setBulkExcluindo] = useState(false)

  function toggleOne(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelecionados((prev) => {
      if (prev.size === cores.length) return new Set()
      return new Set(cores.map((c) => c.id))
    })
  }

  function limparSelecao() {
    setSelecionados(new Set())
  }

  const allChecked = cores.length > 0 && selecionados.size === cores.length
  const someChecked = selecionados.size > 0 && !allChecked

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditingCor('novo')}>
            <Plus />
            Nova cor
          </Button>
        </div>
      )}

      {podeEditar && (
        <BulkActionBar
          count={selecionados.size}
          onClear={limparSelecao}
          onDelete={() => setBulkExcluindo(true)}
        />
      )}

      {cores.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma cor cadastrada.
          </p>
          {podeEditar && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setEditingCor('novo')}
            >
              Cadastrar primeira cor
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {podeEditar && (
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Selecionar tudo"
                        checked={allChecked}
                        indeterminate={someChecked}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-12" />
                  <TableHead>Nome</TableHead>
                  <TableHead>Hex</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cores.map((c) => (
                  <TableRow
                    key={c.id}
                    data-state={selecionados.has(c.id) ? 'selected' : undefined}
                  >
                    {podeEditar && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Selecionar ${c.nome}`}
                          checked={selecionados.has(c.id)}
                          onCheckedChange={() => toggleOne(c.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <ColorSwatch hex={c.codigoHex} hex2={c.codigoHex2} />
                    </TableCell>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {c.codigoHex ?? '—'}
                      {c.codigoHex2 ? ` + ${c.codigoHex2}` : ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.ativo ? 'default' : 'secondary'}>
                        {c.ativo ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setEditingCor(c)}
                            aria-label="Editar"
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setExcluindo(c)}
                            aria-label="Excluir"
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile/tablet retrato */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {cores.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {podeEditar && (
                    <Checkbox
                      aria-label={`Selecionar ${c.nome}`}
                      checked={selecionados.has(c.id)}
                      onCheckedChange={() => toggleOne(c.id)}
                    />
                  )}
                  <ColorSwatch hex={c.codigoHex} hex2={c.codigoHex2} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.nome}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {c.codigoHex ?? '—'}
                      {c.codigoHex2 ? ` + ${c.codigoHex2}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={c.ativo ? 'default' : 'secondary'}>
                    {c.ativo ? 'Ativa' : 'Inativa'}
                  </Badge>
                  {podeEditar && (
                    <>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditingCor(c)}
                        aria-label="Editar"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setExcluindo(c)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dialog criar/editar */}
      <CorDialog cor={editingCor} onClose={() => setEditingCor(null)} />

      {/* Dialog excluir individual */}
      <ExcluirDialog cor={excluindo} onClose={() => setExcluindo(null)} />

      {/* Dialog excluir em massa */}
      <BulkExcluirDialog
        open={bulkExcluindo}
        ids={useMemo(() => Array.from(selecionados), [selecionados])}
        onClose={() => setBulkExcluindo(false)}
        onDone={() => {
          setBulkExcluindo(false)
          limparSelecao()
        }}
      />
    </div>
  )
}

// -----------------------------------------------------------------
// ColorSwatch
// -----------------------------------------------------------------

function ColorSwatch({
  hex,
  hex2,
}: {
  hex: string | null
  hex2?: string | null
}) {
  if (!hex && !hex2) {
    return (
      <div
        className="size-7 rounded-md border border-dashed"
        aria-label="Sem cor definida"
      />
    )
  }
  // Bicolor: swatch dividido na diagonal entre as duas tonalidades.
  if (hex && hex2) {
    return (
      <div
        className="size-7 rounded-md border ring-1 ring-foreground/10"
        style={{
          background: `linear-gradient(135deg, ${hex} 0 50%, ${hex2} 50% 100%)`,
        }}
        aria-label={`${hex} / ${hex2}`}
      />
    )
  }
  const cor = hex ?? hex2!
  return (
    <div
      className="size-7 rounded-md border ring-1 ring-foreground/10"
      style={{ backgroundColor: cor }}
      aria-label={cor}
    />
  )
}

// Normaliza um hex digitado (com ou sem #) pra prévia; null se inválido.
function normHexPreview(v?: string | null): string | null {
  if (!v) return null
  const s = v.trim()
  if (!/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null
  return s.startsWith('#') ? s : `#${s}`
}

function SwatchPreview({
  hex,
  hex2,
}: {
  hex?: string | null
  hex2?: string | null
}) {
  return <ColorSwatch hex={normHexPreview(hex)} hex2={normHexPreview(hex2)} />
}

// -----------------------------------------------------------------
// Dialog de criar/editar
// -----------------------------------------------------------------

function CorDialog({
  cor,
  onClose,
}: {
  cor: Cor | 'novo' | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = cor && cor !== 'novo'
  const open = cor !== null

  const form = useForm<CorInput>({
    resolver: zodResolver(corSchema) as unknown as Resolver<CorInput>,
    defaultValues: {
      nome: isEdit ? cor.nome : '',
      codigoHex: isEdit ? cor.codigoHex ?? '' : '',
      codigoHex2: isEdit ? cor.codigoHex2 ?? '' : '',
      ativo: isEdit ? cor.ativo : true,
    },
    values: {
      nome: isEdit ? cor.nome : '',
      codigoHex: isEdit ? cor.codigoHex ?? '' : '',
      codigoHex2: isEdit ? cor.codigoHex2 ?? '' : '',
      ativo: isEdit ? cor.ativo : true,
    },
  })

  const errs = form.formState.errors
  const ativo = useWatch({ control: form.control, name: 'ativo' })
  const hex1Preview = useWatch({ control: form.control, name: 'codigoHex' })
  const hex2Preview = useWatch({ control: form.control, name: 'codigoHex2' })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarCorAction(cor.id, values)
        : await criarCorAction(values)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      router.refresh()
      onClose()
      form.reset()
    })
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar cor' : 'Nova cor'}</DialogTitle>
          <DialogDescription>
            O código hex é opcional, mas ajuda a visualizar a cor.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cor-nome">
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cor-nome"
              autoFocus
              disabled={isPending}
              {...form.register('nome')}
            />
            {errs.nome && (
              <p className="text-destructive text-xs">{errs.nome.message}</p>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cor-hex">Código hex</Label>
              <Input
                id="cor-hex"
                placeholder="#FF5500"
                disabled={isPending}
                {...form.register('codigoHex')}
              />
              {errs.codigoHex && (
                <p className="text-destructive text-xs">
                  {errs.codigoHex.message}
                </p>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cor-hex2">Código hex 2</Label>
              <Input
                id="cor-hex2"
                placeholder="#FFFFFF"
                disabled={isPending}
                {...form.register('codigoHex2')}
              />
              {errs.codigoHex2 && (
                <p className="text-destructive text-xs">
                  {errs.codigoHex2.message}
                </p>
              )}
            </div>
            {/* Prévia ao vivo do swatch (divide quando há 2 tonalidades). */}
            <SwatchPreview hex={hex1Preview} hex2={hex2Preview} />
          </div>
          <p className="text-muted-foreground -mt-1 text-xs">
            Preencha o 2º hex só para cores bicolor (ex.: capa listrada) — o
            swatch fica dividido entre as duas.
          </p>

          <div className="flex items-center justify-between">
            <Label htmlFor="cor-ativo" className="text-sm">
              Ativa
            </Label>
            <Switch
              id="cor-ativo"
              checked={ativo}
              onCheckedChange={(v) =>
                form.setValue('ativo', v, { shouldDirty: true })
              }
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Dialog de exclusão individual
// -----------------------------------------------------------------

function ExcluirDialog({
  cor,
  onClose,
}: {
  cor: Cor | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!cor) return
    startTransition(async () => {
      const result = await excluirCorAction(cor.id)
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
    <Dialog open={cor !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir cor?</DialogTitle>
          <DialogDescription>
            {cor?.nome} será marcada como excluída. As variações que já a usam
            permanecem inalteradas.
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

// -----------------------------------------------------------------
// Dialog de exclusão em massa
// -----------------------------------------------------------------

function BulkExcluirDialog({
  open,
  ids,
  onClose,
  onDone,
}: {
  open: boolean
  ids: string[]
  onClose: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await excluirMultiplasCoresAction(ids)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluídas')
      router.refresh()
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {ids.length} cor{ids.length === 1 ? '' : 'es'}?</DialogTitle>
          <DialogDescription>
            As cores selecionadas serão marcadas como excluídas. As variações
            que já as usam permanecem inalteradas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={excluir} disabled={isPending}>
            {isPending ? 'Excluindo…' : `Excluir ${ids.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
