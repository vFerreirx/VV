'use client'

import { ArrowDownUp, Search } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  movimentarEstoqueAction,
  type EstoqueItem,
} from './actions'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { SENTIDO_LABEL, sentidoValues } from '@/lib/validators/estoque'

type Props = {
  itens: EstoqueItem[]
  podeMovimentar: boolean
  buscaInicial: string
}

function variacaoLabel(i: EstoqueItem): string {
  return (
    [i.cor, i.modelo, i.tamanho].filter(Boolean).join(' / ') || i.skuVariacao
  )
}

function saldoClasse(saldo: number): string {
  if (saldo <= 0) return 'text-destructive'
  if (saldo <= 5) return 'text-amber-600 dark:text-amber-400'
  return 'text-foreground'
}

export function EstoqueList({ itens, podeMovimentar, buscaInicial }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState(buscaInicial)
  const [movimentar, setMovimentar] = useState<EstoqueItem | null>(null)

  function onBuscaSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    const t = busca.trim()
    if (t) params.set('q', t)
    else params.delete('q')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onBuscaSubmit} className="flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar produto, SKU ou cor…"
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

      {itens.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma variação encontrada.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  {podeMovimentar && <TableHead className="w-28" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.variacaoId}>
                    <TableCell className="font-medium">{i.produtoNome}</TableCell>
                    <TableCell>{variacaoLabel(i)}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {i.skuVariacao}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right text-base font-semibold tabular-nums',
                        saldoClasse(i.saldo),
                      )}
                    >
                      {i.saldo}
                    </TableCell>
                    {podeMovimentar && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setMovimentar(i)}
                        >
                          <ArrowDownUp />
                          Mover
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="space-y-3 md:hidden">
            {itens.map((i) => (
              <div key={i.variacaoId} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{i.produtoNome}</div>
                    <div className="text-muted-foreground text-sm">
                      {variacaoLabel(i)}
                    </div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {i.skuVariacao}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'text-xl font-semibold tabular-nums',
                      saldoClasse(i.saldo),
                    )}
                  >
                    {i.saldo}
                  </div>
                </div>
                {podeMovimentar && (
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMovimentar(i)}
                    >
                      <ArrowDownUp />
                      Movimentar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <MovimentarDialog item={movimentar} onClose={() => setMovimentar(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog: movimentar (entrada/saída)
// -----------------------------------------------------------------

function MovimentarDialog({
  item,
  onClose,
}: {
  item: EstoqueItem | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sentido, setSentido] = useState<(typeof sentidoValues)[number]>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')

  function fechar() {
    setSentido('entrada')
    setQuantidade('')
    setObservacao('')
    onClose()
  }

  function salvar() {
    if (!item) return
    startTransition(async () => {
      const result = await movimentarEstoqueAction({
        produtoId: item.produtoId,
        variacaoId: item.variacaoId,
        sentido,
        quantidade,
        observacao: observacao.trim() || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Registrado')
      router.refresh()
      fechar()
    })
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>
            {item && (
              <>
                {item.produtoNome} — {variacaoLabel(item)} (saldo atual:{' '}
                <span className="font-medium">{item.saldo}</span>)
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {sentidoValues.map((s) => (
              <Button
                key={s}
                type="button"
                variant={sentido === s ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setSentido(s)}
                disabled={isPending}
              >
                {SENTIDO_LABEL[s]}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-qtd">Quantidade</Label>
            <Input
              id="mov-qtd"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              placeholder="0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              disabled={isPending}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-obs">Observação (opcional)</Label>
            <Input
              id="mov-obs"
              placeholder="Ex: acerto de inventário, devolução…"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={isPending}
            />
          </div>
          {sentido === 'saida' && item && Number(quantidade) > item.saldo && (
            <p className="text-amber-600 text-xs dark:text-amber-400">
              Atenção: a saída deixa o saldo negativo ({item.saldo - Number(quantidade)}).
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={isPending || !(Number(quantidade) > 0)}
          >
            {isPending ? 'Salvando…' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
