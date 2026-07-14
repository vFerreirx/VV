'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarTamanhoAction,
  criarTamanhoAction,
  excluirTamanhoAction,
  excluirMultiplosTamanhosAction,
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
import type { Tamanho } from '@/lib/db/schema'
import { tamanhoSchema, type TamanhoInput } from '@/lib/validators/tamanhos'

type Props = {
  tamanhos: Tamanho[]
  podeEditar: boolean
}

export function TamanhosList({ tamanhos, podeEditar }: Props) {
  const [editando, setEditando] = useState<Tamanho | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<Tamanho | null>(null)
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
      if (prev.size === tamanhos.length) return new Set()
      return new Set(tamanhos.map((t) => t.id))
    })
  }
  function limparSelecao() {
    setSelecionados(new Set())
  }
  const allChecked = tamanhos.length > 0 && selecionados.size === tamanhos.length
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
            Novo tamanho
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
                  <TableHead>Código SKU</TableHead>
                  <TableHead>Dimensões</TableHead>
                  <TableHead className="w-24 text-right">Ordem</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tamanhos.map((t) => (
                  <TableRow
                    key={t.id}
                    data-state={selecionados.has(t.id) ? 'selected' : undefined}
                  >
                    {podeEditar && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Selecionar ${t.nome}`}
                          checked={selecionados.has(t.id)}
                          onCheckedChange={() => toggleOne(t.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {t.codigo || '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">
                      {t.larguraCm || t.comprimentoCm
                        ? `${t.larguraCm ?? '—'} × ${t.comprimentoCm ?? '—'} cm`
                        : '—'}
                    </TableCell>
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
                <div className="flex min-w-0 items-center gap-2">
                  {podeEditar && (
                    <Checkbox
                      aria-label={`Selecionar ${t.nome}`}
                      checked={selecionados.has(t.id)}
                      onCheckedChange={() => toggleOne(t.id)}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.nome}</div>
                    {(t.larguraCm || t.comprimentoCm) && (
                      <div className="text-muted-foreground text-xs tabular-nums">
                        {t.larguraCm ?? '—'} × {t.comprimentoCm ?? '—'} cm
                      </div>
                    )}
                    <Badge variant={t.ativo ? 'default' : 'secondary'}>
                      {t.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
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
      const result = await excluirMultiplosTamanhosAction(ids)
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
            Excluir {ids.length} tamanho{ids.length === 1 ? '' : 's'}?
          </DialogTitle>
          <DialogDescription>
            Os tamanhos selecionados serão marcados como excluídos. As variações
            que já os usam permanecem inalteradas.
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
      codigo: isEdit ? (tamanho.codigo ?? '') : '',
      larguraCm: isEdit ? (tamanho.larguraCm ?? '') : '',
      comprimentoCm: isEdit ? (tamanho.comprimentoCm ?? '') : '',
      ordem: isEdit ? String(tamanho.ordem) : String(proximaOrdem),
      ativo: isEdit ? tamanho.ativo : true,
    },
    values: {
      nome: isEdit ? tamanho.nome : '',
      codigo: isEdit ? (tamanho.codigo ?? '') : '',
      larguraCm: isEdit ? (tamanho.larguraCm ?? '') : '',
      comprimentoCm: isEdit ? (tamanho.comprimentoCm ?? '') : '',
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
            <Label htmlFor="tam-codigo">Código no SKU</Label>
            <Input
              id="tam-codigo"
              placeholder="Ex.: K (King), MANTA, A45…"
              disabled={isPending}
              className="uppercase"
              {...form.register('codigo')}
            />
            <p className="text-muted-foreground text-xs">
              Vai no SKU da variação: base + código + cor (ex.: 059-P + K +
              -ROSE = 059-PK-ROSE). Deixe vazio pra não entrar.
            </p>
            {errs.codigo && (
              <p className="text-destructive text-xs">{errs.codigo.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tam-largura">Largura (cm)</Label>
              <Input
                id="tam-largura"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="45"
                disabled={isPending}
                {...form.register('larguraCm')}
              />
              {errs.larguraCm && (
                <p className="text-destructive text-xs">
                  {errs.larguraCm.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tam-comprimento">Comprimento (cm)</Label>
              <Input
                id="tam-comprimento"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="45"
                disabled={isPending}
                {...form.register('comprimentoCm')}
              />
              {errs.comprimentoCm && (
                <p className="text-destructive text-xs">
                  {errs.comprimentoCm.message}
                </p>
              )}
            </div>
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
