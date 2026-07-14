'use client'

import { Copy, PackageSearch, Pencil, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  duplicarProdutoAction,
  excluirMultiplosProdutosAction,
  excluirProdutoAction,
  type ProdutoListItem,
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
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Props = {
  produtos: ProdutoListItem[]
  podeEditar: boolean
  filtrosIniciais: { q?: string; ativo?: string }
}

export function ProdutosList({
  produtos,
  podeEditar,
  filtrosIniciais,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [busca, setBusca] = useState(filtrosIniciais.q ?? '')
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
      if (prev.size === produtos.length) return new Set()
      return new Set(produtos.map((p) => p.id))
    })
  }
  function limparSelecao() {
    setSelecionados(new Set())
  }
  const allChecked = produtos.length > 0 && selecionados.size === produtos.length
  const someChecked = selecionados.size > 0 && !allChecked
  const idsSelecionados = useMemo(
    () => Array.from(selecionados),
    [selecionados],
  )

  function aplicarFiltro(updates: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (
        v === undefined ||
        v === null ||
        v === '' ||
        v === 'todas' ||
        v === 'todos'
      ) {
        params.delete(k)
      } else {
        params.set(k, v)
      }
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function onBuscaSubmit(e: React.FormEvent) {
    e.preventDefault()
    aplicarFiltro({ q: busca.trim() || undefined })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={onBuscaSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Buscar por SKU ou nome…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8"
              disabled={isPending}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Buscar
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Select
            value={filtrosIniciais.ativo ?? 'todos'}
            onValueChange={(v) => aplicarFiltro({ ativo: v })}
          >
            <SelectTrigger size="sm" className="min-w-[8rem]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="true">Ativos</SelectItem>
              <SelectItem value="false">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {podeEditar && (
        <BulkActionBar
          count={selecionados.size}
          onClear={limparSelecao}
          onDelete={() => setBulkExcluindo(true)}
        />
      )}

      {produtos.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Nenhum produto encontrado"
          description="Cadastre seus produtos e variações pra usar nas OPs, no estoque e nas vendas."
          action={
            podeEditar ? (
              <Button render={<Link href="/produtos/novo" />} size="sm">
                Cadastrar primeiro produto
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop: tabela */}
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
                  <TableHead>SKU</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Variações</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map((p) => (
                  <TableRow
                    key={p.id}
                    data-state={selecionados.has(p.id) ? 'selected' : undefined}
                  >
                    {podeEditar && (
                      <TableCell>
                        <Checkbox
                          aria-label={`Selecionar ${p.nome}`}
                          checked={selecionados.has(p.id)}
                          onCheckedChange={() => toggleOne(p.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>
                      <Link
                        href={`/produtos/${p.id}`}
                        className="hover:underline"
                      >
                        {p.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.totalVariacoes}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.ativo ? 'default' : 'secondary'}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    {podeEditar && (
                      <TableCell className="text-right">
                        <RowActions produto={p} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile/Tablet retrato: cards */}
          <div className="vv-stagger space-y-3 md:hidden">
            {produtos.map((p) => (
              <div key={p.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {podeEditar && (
                      <Checkbox
                        aria-label={`Selecionar ${p.nome}`}
                        checked={selecionados.has(p.id)}
                        onCheckedChange={() => toggleOne(p.id)}
                        className="mt-0.5"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/produtos/${p.id}`}
                        className="block font-medium hover:underline"
                      >
                        {p.nome}
                      </Link>
                      <p className="text-muted-foreground font-mono text-xs">
                        {p.sku}
                      </p>
                    </div>
                  </div>
                  <Badge variant={p.ativo ? 'default' : 'secondary'}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>Variações</div>
                  <div className="text-right text-foreground tabular-nums">
                    {p.totalVariacoes}
                  </div>
                </div>
                {podeEditar && (
                  <div className="mt-3 flex justify-end gap-1">
                    <RowActions produto={p} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

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
      const result = await excluirMultiplosProdutosAction(ids)
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
            Excluir {ids.length} produto{ids.length === 1 ? '' : 's'}?
          </DialogTitle>
          <DialogDescription>
            Os produtos selecionados serão marcados como excluídos. As variações
            ficam preservadas pra histórico em OPs e movimentações.
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

// -----------------------------------------------------------------
// Row actions (editar / excluir)
// -----------------------------------------------------------------

function RowActions({ produto }: { produto: ProdutoListItem }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [duplicando, startDuplicar] = useTransition()

  function excluir() {
    startTransition(async () => {
      const result = await excluirProdutoAction(produto.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluído')
      setConfirmando(false)
      router.refresh()
    })
  }

  function duplicar() {
    startDuplicar(async () => {
      const result = await duplicarProdutoAction(produto.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Produto duplicado')
      // Abre o novo produto na edição pra ajustar (ex: trocar o tamanho).
      if ('data' in result && result.data) {
        router.push(`/produtos/${result.data.id}`)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        render={<Link href={`/produtos/${produto.id}`} />}
        aria-label="Editar"
      >
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={duplicar}
        disabled={duplicando}
        aria-label="Duplicar"
        title="Duplicar produto com as variações"
      >
        <Copy />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={() => setConfirmando(true)}
        aria-label="Excluir"
      >
        <Trash2 className="text-destructive" />
      </Button>

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir produto?</DialogTitle>
            <DialogDescription>
              {produto.nome} ({produto.sku}) será marcado como excluído. As
              variações ficam preservadas para referência histórica em OPs e
              movimentações.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmando(false)}
              disabled={isPending}
            >
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
    </div>
  )
}

