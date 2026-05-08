'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarCorAction,
  criarCorAction,
  excluirCorAction,
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
                  <TableHead className="w-12" />
                  <TableHead>Nome</TableHead>
                  <TableHead>Hex</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cores.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <ColorSwatch hex={c.codigoHex} />
                    </TableCell>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {c.codigoHex ?? '—'}
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
                <div className="flex items-center gap-3 min-w-0">
                  <ColorSwatch hex={c.codigoHex} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.nome}</div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {c.codigoHex ?? '—'}
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
      <CorDialog
        cor={editingCor}
        onClose={() => setEditingCor(null)}
      />

      {/* Dialog excluir */}
      <ExcluirDialog cor={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// ColorSwatch
// -----------------------------------------------------------------

function ColorSwatch({ hex }: { hex: string | null }) {
  if (!hex) {
    return (
      <div
        className="size-7 rounded-md border border-dashed"
        aria-label="Sem cor definida"
      />
    )
  }
  return (
    <div
      className="size-7 rounded-md border ring-1 ring-foreground/10"
      style={{ backgroundColor: hex }}
      aria-label={hex}
    />
  )
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
      ativo: isEdit ? cor.ativo : true,
    },
    values: {
      nome: isEdit ? cor.nome : '',
      codigoHex: isEdit ? cor.codigoHex ?? '' : '',
      ativo: isEdit ? cor.ativo : true,
    },
  })

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

  const errs = form.formState.errors
  const ativo = useWatch({ control: form.control, name: 'ativo' })

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

          <div className="space-y-1.5">
            <Label htmlFor="cor-hex">Código hex</Label>
            <Input
              id="cor-hex"
              placeholder="#FF5500"
              disabled={isPending}
              {...form.register('codigoHex')}
            />
            {errs.codigoHex && (
              <p className="text-destructive text-xs">{errs.codigoHex.message}</p>
            )}
          </div>

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
// Dialog de exclusão
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
