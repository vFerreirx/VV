'use client'

import { Pencil, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { excluirProdutoAction, type ProdutoListItem } from './actions'
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

      {produtos.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhum produto encontrado.
          </p>
          {podeEditar && (
            <Button render={<Link href="/produtos/novo" />} className="mt-3" size="sm">
              Cadastrar primeiro produto
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Gramatura</TableHead>
                  <TableHead className="text-right">Largura</TableHead>
                  <TableHead className="text-right">Variações</TableHead>
                  <TableHead>Status</TableHead>
                  {podeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>
                      <Link
                        href={`/produtos/${p.id}`}
                        className="hover:underline"
                      >
                        {p.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {p.gramatura ? `${p.gramatura} g/m²` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {p.larguraCm ? `${p.larguraCm} cm` : '—'}
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
          <div className="space-y-3 md:hidden">
            {produtos.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-2">
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
                  <Badge variant={p.ativo ? 'default' : 'secondary'}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div>Gramatura</div>
                  <div className="text-right text-foreground tabular-nums">
                    {p.gramatura ? `${p.gramatura} g/m²` : '—'}
                  </div>
                  <div>Largura</div>
                  <div className="text-right text-foreground tabular-nums">
                    {p.larguraCm ? `${p.larguraCm} cm` : '—'}
                  </div>
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
    </div>
  )
}

// -----------------------------------------------------------------
// Row actions (editar / excluir)
// -----------------------------------------------------------------

function RowActions({ produto }: { produto: ProdutoListItem }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()

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

