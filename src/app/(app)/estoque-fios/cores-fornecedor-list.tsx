'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarCorFornecedorAction,
  criarCorFornecedorAction,
  excluirCorFornecedorAction,
  type CorFornecedorItem,
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
import { corFornecedorSchema, type CorFornecedorInput } from '@/lib/validators/fios'

type Props = {
  coresFornecedor: CorFornecedorItem[]
  coresAtivas: Cor[]
  podeEditar: boolean
}

export function CoresFornecedorList({ coresFornecedor, coresAtivas, podeEditar }: Props) {
  const [editing, setEditing] = useState<CorFornecedorItem | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<CorFornecedorItem | null>(null)

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing('novo')}>
            <Plus />
            Nova cor de fornecedor
          </Button>
        </div>
      )}

      {coresFornecedor.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">Nenhuma cor de fornecedor cadastrada.</p>
          {podeEditar && (
            <Button size="sm" className="mt-3" onClick={() => setEditing('novo')}>
              Cadastrar primeira cor
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cor do fornecedor</TableHead>
                <TableHead>Nossa cor equivalente</TableHead>
                <TableHead>Status</TableHead>
                {podeEditar && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {coresFornecedor.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nomeFornecedor}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="ring-foreground/10 size-4 rounded border ring-1"
                        style={{ backgroundColor: c.corHex ?? undefined }}
                      />
                      {c.corNome}
                    </div>
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
                          onClick={() => setEditing(c)}
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
      )}

      <CorFornecedorDialog
        cor={editing}
        coresAtivas={coresAtivas}
        onClose={() => setEditing(null)}
      />

      <ExcluirDialog cor={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

function CorFornecedorDialog({
  cor,
  coresAtivas,
  onClose,
}: {
  cor: CorFornecedorItem | 'novo' | null
  coresAtivas: Cor[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = cor && cor !== 'novo'
  const open = cor !== null

  const form = useForm<CorFornecedorInput>({
    resolver: zodResolver(corFornecedorSchema) as unknown as Resolver<CorFornecedorInput>,
    values: {
      nomeFornecedor: isEdit ? cor.nomeFornecedor : '',
      corId: isEdit ? cor.corId : '',
      ativo: isEdit ? cor.ativo : true,
    },
  })

  const errs = form.formState.errors

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarCorFornecedorAction(cor.id, values)
        : await criarCorFornecedorAction(values)

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
          <DialogTitle>
            {isEdit ? 'Editar cor de fornecedor' : 'Nova cor de fornecedor'}
          </DialogTitle>
          <DialogDescription>
            Vincule o nome/código que o fornecedor usa à cor equivalente do nosso catálogo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cf-nome">
              Nome/código do fornecedor <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cf-nome"
              autoFocus
              disabled={isPending}
              {...form.register('nomeFornecedor')}
            />
            {errs.nomeFornecedor && (
              <p className="text-destructive text-xs">{errs.nomeFornecedor.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cf-cor">
              Nossa cor equivalente <span className="text-destructive">*</span>
            </Label>
            <Controller
              control={form.control}
              name="corId"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value}
                  onValueChange={(v) => v && ctl.onChange(v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="cf-cor" className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {coresAtivas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errs.corId && <p className="text-destructive text-xs">{errs.corId.message}</p>}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="cf-ativo" className="text-sm">
              Ativa
            </Label>
            <Controller
              control={form.control}
              name="ativo"
              render={({ field: ctl }) => (
                <Switch
                  id="cf-ativo"
                  checked={ctl.value}
                  onCheckedChange={ctl.onChange}
                  disabled={isPending}
                />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
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

function ExcluirDialog({ cor, onClose }: { cor: CorFornecedorItem | null; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!cor) return
    startTransition(async () => {
      const result = await excluirCorFornecedorAction(cor.id)
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
          <DialogTitle>Excluir cor de fornecedor?</DialogTitle>
          <DialogDescription>
            {cor?.nomeFornecedor} será marcada como excluída. Lotes já cadastrados com ela
            permanecem inalterados.
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
