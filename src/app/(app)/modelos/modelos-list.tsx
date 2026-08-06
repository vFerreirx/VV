'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarModeloAction,
  criarModeloAction,
  excluirModeloAction,
  excluirMultiplosModelosAction,
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
import { useListaAnimada } from '@/components/ui/use-lista-animada'
import { Textarea } from '@/components/ui/textarea'
import type { Modelo } from '@/lib/db/schema'
import { modeloSchema, type ModeloInput } from '@/lib/validators/modelos'

type Props = {
  modelos: Modelo[]
  podeEditar: boolean
}

export function ModelosList({ modelos, podeEditar }: Props) {
  const [corpoTabela] = useListaAnimada<HTMLTableSectionElement>()
  const [editando, setEditando] = useState<Modelo | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Modelo | null>(null)
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
      if (prev.size === modelos.length) return new Set()
      return new Set(modelos.map((m) => m.id))
    })
  }
  function limparSelecao() {
    setSelecionados(new Set())
  }
  const allChecked = modelos.length > 0 && selecionados.size === modelos.length
  const someChecked = selecionados.size > 0 && !allChecked
  const idsSelecionados = useMemo(
    () => Array.from(selecionados),
    [selecionados],
  )

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditando('novo')}>
            <Plus />
            Novo modelo
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

      {modelos.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhum modelo cadastrado.
          </p>
          {podeEditar && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setEditando('novo')}
            >
              Cadastrar primeiro modelo
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
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody ref={corpoTabela}>
                {modelos.map((m) => (
                  <TableRow
                    key={m.id}
                    data-state={selecionados.has(m.id) ? 'selected' : undefined}
                  >
                    {podeEditar && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Selecionar ${m.nome}`}
                          checked={selecionados.has(m.id)}
                          onCheckedChange={() => toggleOne(m.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{m.nome}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {m.descricao ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.ativo ? 'default' : 'secondary'}>
                        {m.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setEditando(m)}
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
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {modelos.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {podeEditar && (
                    <Checkbox
                      aria-label={`Selecionar ${m.nome}`}
                      checked={selecionados.has(m.id)}
                      onCheckedChange={() => toggleOne(m.id)}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.nome}</div>
                    {m.descricao && (
                      <div className="text-muted-foreground truncate text-xs">
                        {m.descricao}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={m.ativo ? 'default' : 'secondary'}>
                    {m.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  {podeEditar && (
                    <>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditando(m)}
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
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ModeloDialog
        modelo={editando}
        onClose={() => setEditando(null)}
      />
      <ExcluirDialog
        modelo={excluindo}
        onClose={() => setExcluindo(null)}
      />
      <BulkExcluirDialog
        open={bulkExcluindo}
        ids={idsSelecionados}
        onClose={() => setBulkExcluindo(false)}
        onDone={() => {
          setBulkExcluindo(false)
          limparSelecao()
        }}
      />
    </div>
  )
}

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
      const result = await excluirMultiplosModelosAction(ids)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluídos')
      router.refresh()
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Excluir {ids.length} modelo{ids.length === 1 ? '' : 's'}?
          </DialogTitle>
          <DialogDescription>
            Os modelos selecionados serão marcados como excluídos. As variações
            que já os usam permanecem inalteradas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} variant="destructive" onClick={excluir} disabled={isPending}>
            {`Excluir ${ids.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModeloDialog({
  modelo,
  onClose,
}: {
  modelo: Modelo | 'novo' | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = modelo && modelo !== 'novo'
  const open = modelo !== null

  const form = useForm<ModeloInput>({
    resolver: zodResolver(modeloSchema) as unknown as Resolver<ModeloInput>,
    defaultValues: {
      nome: isEdit ? modelo.nome : '',
      descricao: isEdit ? (modelo.descricao ?? '') : '',
      ativo: isEdit ? modelo.ativo : true,
    },
    values: {
      nome: isEdit ? modelo.nome : '',
      descricao: isEdit ? (modelo.descricao ?? '') : '',
      ativo: isEdit ? modelo.ativo : true,
    },
  })

  const ativo = useWatch({ control: form.control, name: 'ativo' })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarModeloAction(modelo.id, values)
        : await criarModeloAction(values)

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
          <DialogTitle>{isEdit ? 'Editar modelo' : 'Novo modelo'}</DialogTitle>
          <DialogDescription>
            Ex: Padrão Floral, Listrado Marinho, Cubos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="modelo-nome">
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              id="modelo-nome"
              autoFocus
              disabled={isPending}
              {...form.register('nome')}
            />
            {errs.nome && (
              <p className="text-destructive text-xs">{errs.nome.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="modelo-descricao">Descrição</Label>
            <Textarea
              id="modelo-descricao"
              rows={2}
              disabled={isPending}
              {...form.register('descricao')}
            />
            {errs.descricao && (
              <p className="text-destructive text-xs">
                {errs.descricao.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="modelo-ativo" className="text-sm">
              Ativo
            </Label>
            <Switch
              id="modelo-ativo"
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
            <Button loading={isPending} type="submit" disabled={isPending}>
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({
  modelo,
  onClose,
}: {
  modelo: Modelo | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!modelo) return
    startTransition(async () => {
      const result = await excluirModeloAction(modelo.id)
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
    <Dialog open={modelo !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir modelo?</DialogTitle>
          <DialogDescription>
            {modelo?.nome} será marcado como excluído. As variações que já o
            usam permanecem inalteradas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending}
            variant="destructive"
            onClick={excluir}
            disabled={isPending}
          >
            {'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
