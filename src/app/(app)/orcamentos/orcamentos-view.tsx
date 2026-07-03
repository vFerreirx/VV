'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileText, Pencil, Plus, Printer, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarOrcamentoAction,
  criarOrcamentoAction,
  excluirOrcamentoAction,
  obterOrcamento,
  type OrcamentoListItem,
} from './actions'
import type { ProdutoComVariacoesParaForm } from '../ordens/actions'
import { Button } from '@/components/ui/button'
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
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'

type Props = {
  orcamentos: OrcamentoListItem[]
  produtos: ProdutoComVariacoesParaForm[]
  podeEditar: boolean
}

function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Máscara BRL: dígitos preenchem da direita (centavos).
function mascararMoeda(valor: string): string {
  const digits = valor.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function moedaParaDecimal(masked: string): string {
  const digits = masked.replace(/\D/g, '')
  if (!digits) return ''
  return (Number(digits) / 100).toFixed(2)
}

function decimalParaMoeda(dec: string): string {
  const cents = Math.round(Number(dec) * 100)
  if (!Number.isFinite(cents)) return ''
  return mascararMoeda(String(cents))
}

export function OrcamentosView({ orcamentos, produtos, podeEditar }: Props) {
  const [editando, setEditando] = useState<OrcamentoListItem | 'novo' | null>(
    null,
  )
  const [excluindo, setExcluindo] = useState<OrcamentoListItem | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Orçamentos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monte o orçamento pro cliente e imprima/envie em PDF.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setEditando('novo')}>
            <Plus />
            Fazer orçamento
          </Button>
        )}
      </div>

      {orcamentos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum orçamento"
          description="Clique em “Fazer orçamento” pra montar o primeiro."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orcamentos.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">
                    #{o.numero}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/orcamentos/${o.id}`}
                      className="hover:underline"
                    >
                      {o.cliente}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {format(new Date(o.createdAt), 'dd/MM/yyyy', {
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.itensCount}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {reais(o.total)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        render={<Link href={`/orcamentos/${o.id}`} />}
                        aria-label="Abrir / imprimir"
                        title="Abrir / imprimir"
                      >
                        <Printer />
                      </Button>
                      {podeEditar && (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setEditando(o)}
                            aria-label="Editar"
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setExcluindo(o)}
                            aria-label="Excluir"
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editando && (
        <OrcamentoDialog
          orcamentoId={editando === 'novo' ? null : editando.id}
          produtos={produtos}
          onClose={() => setEditando(null)}
        />
      )}
      <ExcluirDialog
        orcamento={excluindo}
        onClose={() => setExcluindo(null)}
      />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog: fazer / editar orçamento
// -----------------------------------------------------------------

type LinhaItem = { descricao: string; quantidade: string; preco: string }

const LINHA_VAZIA: LinhaItem = { descricao: '', quantidade: '1', preco: '' }

function OrcamentoDialog({
  orcamentoId,
  produtos,
  onClose,
}: {
  orcamentoId: string | null
  produtos: ProdutoComVariacoesParaForm[]
  onClose: () => void
}) {
  const isEdit = orcamentoId !== null
  const [isPending, startTransition] = useTransition()
  const [carregado, setCarregado] = useState(!isEdit)
  const [cliente, setCliente] = useState('')
  const [observacao, setObservacao] = useState('')
  const [itens, setItens] = useState<LinhaItem[]>([{ ...LINHA_VAZIA }])

  // Edição: carrega o orçamento uma vez ao abrir (flag vira true
  // sincronamente, então o fetch dispara só na primeira renderização).
  if (isEdit && !carregado) {
    setCarregado(true)
    void obterOrcamento(orcamentoId).then((o) => {
      if (!o) {
        toast.error('Orçamento não encontrado')
        onClose()
        return
      }
      setCliente(o.cliente)
      setObservacao(o.observacao ?? '')
      setItens(
        o.itens.map((it) => ({
          descricao: it.descricao,
          quantidade: String(it.quantidade),
          preco: decimalParaMoeda(it.precoUnitario),
        })),
      )
    })
  }

  function patchItem(idx: number, patch: Partial<LinhaItem>) {
    setItens((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function addItem(descricao = '') {
    setItens((prev) => [...prev, { ...LINHA_VAZIA, descricao }])
  }
  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  const total = itens.reduce(
    (s, l) =>
      s + (Number(l.quantidade) || 0) * Number(moedaParaDecimal(l.preco) || 0),
    0,
  )

  function salvar() {
    const itensLimpos = itens
      .filter((l) => l.descricao.trim().length > 0)
      .map((l) => ({
        descricao: l.descricao.trim(),
        quantidade: Math.max(1, Number(l.quantidade) || 1),
        precoUnitario: moedaParaDecimal(l.preco) || '0',
      }))
    if (itensLimpos.length === 0) {
      toast.error('Adicione ao menos um item')
      return
    }

    startTransition(async () => {
      const payload = {
        cliente,
        observacao: observacao || undefined,
        itens: itensLimpos,
      }
      const result = isEdit
        ? await atualizarOrcamentoAction(orcamentoId, payload)
        : await criarOrcamentoAction(payload)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-6">
          <DialogTitle>
            {isEdit ? 'Editar orçamento' : 'Fazer orçamento'}
          </DialogTitle>
          <DialogDescription>
            Itens com quantidade e preço unitário. Puxe um produto do
            catálogo ou escreva a descrição livre.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label htmlFor="orc-cliente">Cliente</Label>
            <Input
              id="orc-cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              disabled={isPending}
              autoFocus
              placeholder="Nome do cliente / empresa"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Itens</Label>
              {/* Atalho: adiciona linha já com o nome do produto. */}
              <Select
                value={undefined as string | undefined}
                onValueChange={(v) => {
                  const p = produtos.find((x) => x.id === v)
                  if (p) addItem(p.nome)
                }}
                disabled={isPending}
              >
                <SelectTrigger size="sm" className="w-56">
                  <SelectValue placeholder="+ produto do catálogo" />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {itens.map((linha, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_4rem_7rem_auto] items-center gap-2"
              >
                <Input
                  aria-label="Descrição do item"
                  placeholder="Descrição (ex.: Peseira Aconchego King Terracota)"
                  value={linha.descricao}
                  onChange={(e) => patchItem(idx, { descricao: e.target.value })}
                  disabled={isPending}
                  className="h-9"
                />
                <Input
                  inputMode="numeric"
                  aria-label="Quantidade"
                  placeholder="qtd"
                  value={linha.quantidade}
                  onChange={(e) =>
                    patchItem(idx, {
                      quantidade: e.target.value.replace(/\D/g, ''),
                    })
                  }
                  disabled={isPending}
                  className="h-9 text-center"
                />
                <div className="relative">
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs">
                    R$
                  </span>
                  <Input
                    aria-label="Preço unitário"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={linha.preco}
                    onChange={(e) =>
                      patchItem(idx, { preco: mascararMoeda(e.target.value) })
                    }
                    disabled={isPending}
                    className="h-9 pl-7 text-right"
                  />
                </div>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => removeItem(idx)}
                  disabled={isPending || itens.length === 1}
                  aria-label="Remover item"
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => addItem()}
              disabled={isPending}
            >
              <Plus />
              Adicionar item
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orc-obs">Observação (opcional)</Label>
            <Textarea
              id="orc-obs"
              rows={2}
              placeholder="Condições, prazo de entrega, validade do orçamento…"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t p-6 sm:justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-semibold tabular-nums">{reais(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={isPending}>
              {isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Dialog: excluir
// -----------------------------------------------------------------

function ExcluirDialog({
  orcamento,
  onClose,
}: {
  orcamento: OrcamentoListItem | null
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!orcamento) return
    startTransition(async () => {
      const result = await excluirOrcamentoAction(orcamento.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluído')
      onClose()
    })
  }

  return (
    <Dialog open={orcamento !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir orçamento?</DialogTitle>
          <DialogDescription>
            O orçamento #{orcamento?.numero} de {orcamento?.cliente} será
            removido.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={excluir} disabled={isPending}>
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
