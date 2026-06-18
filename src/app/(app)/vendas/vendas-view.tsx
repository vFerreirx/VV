'use client'

import { addDays, format, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  criarVendaAction,
  excluirVendaAction,
  type VendaItem,
} from './actions'
import type { ProdutoComVariacoesParaForm } from '@/app/(app)/ordens/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'
import { vendaCanalValues } from '@/lib/validators/vendas'

const CANAL_BADGE: Record<(typeof vendaCanalValues)[number], string> = {
  full_ml: 'bg-amber-400/20 text-amber-700 dark:text-amber-300',
  full_shopee: 'bg-orange-500/20 text-orange-700 dark:text-orange-300',
  venda_direta: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
}

type Props = {
  data: string
  vendas: VendaItem[]
  produtos: ProdutoComVariacoesParaForm[]
}

export function VendasView({ data, vendas, produtos }: Props) {
  const router = useRouter()
  const [novaOpen, setNovaOpen] = useState(false)

  const refDate = useMemo(() => parse(data, 'yyyy-MM-dd', new Date()), [data])

  function irPara(d: Date) {
    router.push(`/vendas?data=${format(d, 'yyyy-MM-dd')}`)
  }

  const totalPecas = vendas.reduce((s, v) => s + v.quantidade, 0)
  const porCanal = vendaCanalValues.map((c) => ({
    canal: c,
    total: vendas
      .filter((v) => v.canal === c)
      .reduce((s, v) => s + v.quantidade, 0),
  }))

  return (
    <div className="space-y-4">
      {/* Navegação de dia + ação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Dia anterior"
            onClick={() => irPara(addDays(refDate, -1))}
          >
            <ChevronLeft />
          </Button>
          <div className="min-w-40 text-center">
            <div className="font-medium capitalize">
              {format(refDate, "EEEE, dd 'de' MMM", { locale: ptBR })}
            </div>
            <div className="text-muted-foreground text-xs">
              {format(refDate, 'yyyy', { locale: ptBR })}
            </div>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próximo dia"
            onClick={() => irPara(addDays(refDate, 1))}
          >
            <ChevronRight />
          </Button>
          <Button variant="outline" size="sm" onClick={() => irPara(new Date())}>
            Hoje
          </Button>
        </div>
        <Button size="sm" onClick={() => setNovaOpen(true)}>
          <Plus />
          Registrar venda
        </Button>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card size="sm">
          <CardContent>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              Total do dia
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {totalPecas}
            </div>
          </CardContent>
        </Card>
        {porCanal.map((c) => (
          <Card key={c.canal} size="sm">
            <CardContent>
              <div className="text-muted-foreground text-xs uppercase tracking-wide">
                {CANAL_LABEL_CURTO[c.canal]}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {c.total}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista do dia */}
      {vendas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma venda registrada nesse dia.
          </p>
          <Button size="sm" className="mt-3" onClick={() => setNovaOpen(true)}>
            Registrar a primeira
          </Button>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {vendas.map((v) => (
            <li key={v.id} className="flex items-center gap-3 p-3">
              <Badge className={cn('shrink-0', CANAL_BADGE[v.canal])}>
                {CANAL_LABEL_CURTO[v.canal]}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {v.produtoNome}
                  {v.variacaoLabel && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      — {v.variacaoLabel}
                    </span>
                  )}
                </div>
                {v.observacao && (
                  <div className="text-muted-foreground truncate text-xs">
                    {v.observacao}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right tabular-nums">
                <span className="font-semibold">{v.quantidade}</span>
                <span className="text-muted-foreground text-xs"> un</span>
              </div>
              <ExcluirVenda id={v.id} />
            </li>
          ))}
        </ul>
      )}

      <NovaVendaDialog
        open={novaOpen}
        onClose={() => setNovaOpen(false)}
        data={data}
        produtos={produtos}
      />
    </div>
  )
}

function ExcluirVenda({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    startTransition(async () => {
      const result = await excluirVendaAction(id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Removida')
      router.refresh()
    })
  }

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={excluir}
      disabled={isPending}
      aria-label="Excluir venda"
    >
      <Trash2 className="text-destructive" />
    </Button>
  )
}

// -----------------------------------------------------------------
// Dialog: nova venda
// -----------------------------------------------------------------

function NovaVendaDialog({
  open,
  onClose,
  data,
  produtos,
}: {
  open: boolean
  onClose: () => void
  data: string
  produtos: ProdutoComVariacoesParaForm[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [produtoId, setProdutoId] = useState('')
  const [variacaoId, setVariacaoId] = useState('nenhuma')
  const [quantidade, setQuantidade] = useState('')
  const [canal, setCanal] =
    useState<(typeof vendaCanalValues)[number]>('venda_direta')

  const produtoSel = useMemo(
    () => produtos.find((p) => p.id === produtoId),
    [produtos, produtoId],
  )
  const variacoes = useMemo(
    () => produtoSel?.variacoes ?? [],
    [produtoSel],
  )

  const produtosItems = useMemo(
    () => produtos.map((p) => ({ value: p.id, label: `${p.sku} — ${p.nome}` })),
    [produtos],
  )
  const variacoesItems = useMemo(
    () => [
      { value: 'nenhuma', label: 'Sem variação' },
      ...variacoes.map((v) => ({
        value: v.id,
        label:
          [v.cor, v.modelo, v.tamanho].filter(Boolean).join(' / ') ||
          v.skuVariacao,
      })),
    ],
    [variacoes],
  )
  const canalItems = useMemo(
    () =>
      Object.fromEntries(
        vendaCanalValues.map((c) => [c, CANAL_LABEL_CURTO[c]]),
      ),
    [],
  )

  function fechar() {
    setProdutoId('')
    setVariacaoId('nenhuma')
    setQuantidade('')
    setCanal('venda_direta')
    onClose()
  }

  function salvar() {
    startTransition(async () => {
      const result = await criarVendaAction({
        produtoId,
        variacaoId: variacaoId === 'nenhuma' ? undefined : variacaoId,
        quantidade,
        canal,
        data,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Registrada')
      router.refresh()
      fechar()
    })
  }

  const valido = produtoId !== '' && Number(quantidade) > 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar venda</DialogTitle>
          <DialogDescription>
            Dia {format(parse(data, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="v-prod">Produto</Label>
            <Select
              items={produtosItems}
              value={produtoId || ''}
              onValueChange={(v) => {
                setProdutoId(v ?? '')
                setVariacaoId('nenhuma')
              }}
              disabled={isPending}
            >
              <SelectTrigger id="v-prod" className="w-full">
                <SelectValue placeholder="Selecione um produto…" />
              </SelectTrigger>
              <SelectContent>
                {produtos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {`${p.sku} — ${p.nome}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-var">Variação</Label>
            <Select
              items={variacoesItems}
              value={variacaoId}
              onValueChange={(v) => v && setVariacaoId(v)}
              disabled={isPending || !produtoSel || variacoes.length === 0}
            >
              <SelectTrigger id="v-var" className="w-full">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem variação</SelectItem>
                {variacoes.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {[v.cor, v.modelo, v.tamanho].filter(Boolean).join(' / ') ||
                      v.skuVariacao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="v-qtd">Quantidade</Label>
              <Input
                id="v-qtd"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-canal">Canal</Label>
              <Select
                items={canalItems}
                value={canal}
                onValueChange={(v) =>
                  v && setCanal(v as (typeof vendaCanalValues)[number])
                }
                disabled={isPending}
              >
                <SelectTrigger id="v-canal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vendaCanalValues.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CANAL_LABEL_CURTO[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={isPending || !valido}>
            {isPending ? 'Salvando…' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
