'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarTamanhoAction,
  criarTamanhoAction,
  excluirTamanhoAction,
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
import type { Tamanho } from '@/lib/db/schema'
import { tamanhoSchema, type TamanhoInput } from '@/lib/validators/tamanhos'

type Props = {
  tamanhos: Tamanho[]
  podeEditar: boolean
}

export function TamanhosList({ tamanhos, podeEditar }: Props) {
  const [editando, setEditando] = useState<Tamanho | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Tamanho | null>(null)

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditando('novo')}>
            <Plus />
            Novo tamanho
          </Button>
        </div>
      )}

      {tamanhos.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhum tamanho cadastrado.
          </p>
          {podeEditar && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setEditando('novo')}
            >
              Cadastrar primeiro tamanho
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
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-24 text-right">Ordem</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tamanhos.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {t.ordem}
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.ativo ? 'default' : 'secondary'}>
                        {t.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setEditando(t)}
                            aria-label="Editar"
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setExcluindo(t)}
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

          {/* Mobile */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:hidden">
            {tamanhos.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.nome}</div>
                  <Badge variant={t.ativo ? 'default' : 'secondary'}>
                    {t.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                {podeEditar && (
                  <div className="flex flex-col">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditando(t)}
                      aria-label="Editar"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setExcluindo(t)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <TamanhoDialog
        tamanho={editando}
        onClose={() => setEditando(null)}
        proximaOrdem={tamanhos.length}
      />
      <ExcluirDialog
        tamanho={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </div>
  )
}

function TamanhoDialog({
  tamanho,
  onClose,
  proximaOrdem,
}: {
  tamanho: Tamanho | 'novo' | null
  onClose: () => void
  proximaOrdem: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = tamanho && tamanho !== 'novo'
  const open = tamanho !== null

  const form = useForm<TamanhoInput>({
    resolver: zodResolver(tamanhoSchema) as unknown as Resolver<TamanhoInput>,
    defaultValues: {
      nome: isEdit ? tamanho.nome : '',
      ordem: isEdit ? String(tamanho.ordem) : String(proximaOrdem),
      ativo: isEdit ? tamanho.ativo : true,
    },
    values: {
      nome: isEdit ? tamanho.nome : '',
      ordem: isEdit ? String(tamanho.ordem) : String(proximaOrdem),
      ativo: isEdit ? tamanho.ativo : true,
    },
  })

  const ativo = useWatch({ control: form.control, name: 'ativo' })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarTamanhoAction(tamanho.id, values)
        : await criarTamanhoAction(values)

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar tamanho' : 'Novo tamanho'}
          </DialogTitle>
          <DialogDescription>
            Use a Ordem pra controlar a sequência nos selects (menor primeiro).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="tam-nome">
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tam-nome"
              autoFocus
              placeholder="P, M, G, GG, Casal, Queen…"
              disabled={isPending}
              {...form.register('nome')}
            />
            {errs.nome && (
              <p className="text-destructive text-xs">{errs.nome.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tam-ordem">
              Ordem <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tam-ordem"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              disabled={isPending}
              {...form.register('ordem')}
            />
            {errs.ordem && (
              <p className="text-destructive text-xs">{errs.ordem.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="tam-ativo" className="text-sm">
              Ativo
            </Label>
            <Switch
              id="tam-ativo"
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

function ExcluirDialog({
  tamanho,
  onClose,
}: {
  tamanho: Tamanho | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!tamanho) return
    startTransition(async () => {
      const result = await excluirTamanhoAction(tamanho.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluído')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={tamanho !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir tamanho?</DialogTitle>
          <DialogDescription>
            {tamanho?.nome} será marcado como excluído. As variações que já o
            usam permanecem inalteradas.
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
