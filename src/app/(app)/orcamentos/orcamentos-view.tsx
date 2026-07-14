'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Copy, FileText, Pencil, Plus, Printer, Trash2, X } from 'lucide-react'
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
import type { KitComItens } from '../kits/actions'
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
import { cn } from '@/lib/utils'

type Props = {
  orcamentos: OrcamentoListItem[]
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  // Último preço usado por descrição (pré-preenche ao puxar do catálogo).
  precos: Record<string, string>
  // Clientes de orçamentos anteriores (autocomplete).
  clientes: string[]
  podeEditar: boolean
}

// Token interno pra tamanho/cor nulos.
const SEM = '__sem__'
const tok = (s: string | null) => s ?? SEM
const distintos = <T,>(arr: T[]): T[] => [...new Set(arr)]

type Edicao = { modo: 'novo' | 'editar' | 'duplicar'; id?: string }

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

export function OrcamentosView({
  orcamentos,
  produtos,
  kits,
  precos,
  clientes,
  podeEditar,
}: Props) {
  const [editando, setEditando] = useState<Edicao | null>(null)
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
          <Button onClick={() => setEditando({ modo: 'novo' })}>
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
                            onClick={() =>
                              setEditando({ modo: 'duplicar', id: o.id })
                            }
                            aria-label="Duplicar"
                            title="Duplicar (novo orçamento com os mesmos itens)"
                          >
                            <Copy />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() =>
                              setEditando({ modo: 'editar', id: o.id })
                            }
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
          edicao={editando}
          produtos={produtos}
          kits={kits}
          precos={precos}
          clientes={clientes}
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
  edicao,
  produtos,
  kits,
  precos,
  clientes,
  onClose,
}: {
  edicao: Edicao
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  precos: Record<string, string>
  clientes: string[]
  onClose: () => void
}) {
  // 'duplicar' carrega os dados mas salva como orçamento NOVO.
  const isEdit = edicao.modo === 'editar'
  const precisaCarregar = edicao.modo !== 'novo' && edicao.id != null
  const [isPending, startTransition] = useTransition()
  const [carregado, setCarregado] = useState(!precisaCarregar)
  const [cliente, setCliente] = useState('')
  const [observacao, setObservacao] = useState('')
  const [itens, setItens] = useState<LinhaItem[]>([{ ...LINHA_VAZIA }])

  // Editar/duplicar: carrega o orçamento uma vez ao abrir (flag vira true
  // sincronamente, então o fetch dispara só na primeira renderização).
  if (precisaCarregar && !carregado) {
    setCarregado(true)
    void obterOrcamento(edicao.id!).then((o) => {
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
  // Nova linha; com descrição do catálogo, já puxa o último preço usado.
  function addItem(descricao = '') {
    const precoSalvo = descricao ? precos[descricao] : undefined
    setItens((prev) => [
      ...prev,
      {
        ...LINHA_VAZIA,
        descricao,
        preco: precoSalvo ? decimalParaMoeda(precoSalvo) : '',
      },
    ])
  }
  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  const total = itens.reduce(
    (s, l) =>
      s + (Number(l.quantidade) || 0) * Number(moedaParaDecimal(l.preco) || 0),
    0,
  )
  const totalUnidades = itens.reduce(
    (s, l) => s + (l.descricao.trim() ? Number(l.quantidade) || 0 : 0),
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
        ? await atualizarOrcamentoAction(edicao.id!, payload)
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
    <Dialog
      open
      // Fecha só pelo "X" (close-press) ou "Cancelar" (onClose direto):
      // clique fora e Esc são ignorados pra não perder o orçamento digitado.
      disablePointerDismissal
      onOpenChange={(o, details) => {
        if (!o && details.reason === 'close-press') onClose()
      }}
    >
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-6">
          <DialogTitle>
            {isEdit
              ? 'Editar orçamento'
              : edicao.modo === 'duplicar'
                ? 'Duplicar orçamento'
                : 'Fazer orçamento'}
          </DialogTitle>
          <DialogDescription>
            Itens com quantidade e preço unitário. Puxe um produto do
            catálogo ou escreva a descrição livre.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto p-6">
          <div className="space-y-1.5">
            <Label htmlFor="orc-cliente">Cliente</Label>
            <Input
              id="orc-cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              disabled={isPending}
              autoFocus
              placeholder="Nome do cliente / empresa"
              list="orc-clientes"
            />
            {/* Autocomplete com clientes de orçamentos anteriores */}
            <datalist id="orc-clientes">
              {clientes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Builder: produto/kit + tamanho + VÁRIAS cores de uma vez */}
          <CatalogoBuilder
            produtos={produtos}
            kits={kits}
            precos={precos}
            disabled={isPending}
            onAdd={(novas) =>
              setItens((prev) => {
                // Substitui a linha inicial vazia, se for a única.
                const base =
                  prev.length === 1 &&
                  !prev[0].descricao &&
                  !prev[0].preco
                    ? []
                    : prev
                return [...base, ...novas]
              })
            }
          />

          <div className="space-y-2">
            <Label>Itens</Label>

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
            <span className="font-semibold tabular-nums">
              {totalUnidades.toLocaleString('pt-BR')} un
            </span>
            <span className="text-muted-foreground"> · </span>
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
// Builder do catálogo: produto/kit + tamanho + várias cores de uma vez
// (gera uma linha por cor, com o último preço usado quando existir).
// -----------------------------------------------------------------

function CatalogoBuilder({
  produtos,
  kits,
  precos,
  disabled,
  onAdd,
}: {
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  precos: Record<string, string>
  disabled: boolean
  onAdd: (linhas: LinhaItem[]) => void
}) {
  // origem: 'p:<id>' (produto) ou 'k:<id>' (kit)
  const [origem, setOrigem] = useState('')
  const [tamanho, setTamanho] = useState('')
  const [coresSel, setCoresSel] = useState<Set<string>>(new Set())
  // Kit: cor escolhida POR ITEM do kit (kitItemId -> cor) — cada item pode
  // ter cor própria (ex.: capa numa cor, manta noutra).
  const [coresKit, setCoresKit] = useState<Record<string, string>>({})
  const [qtd, setQtd] = useState('1')
  const [preco, setPreco] = useState('')

  const produto = origem.startsWith('p:')
    ? produtos.find((p) => p.id === origem.slice(2))
    : undefined
  const kit = origem.startsWith('k:')
    ? kits.find((k) => k.id === origem.slice(2))
    : undefined

  // Tamanhos do produto (kits não têm tamanho no builder).
  const tamanhos = produto
    ? distintos(produto.variacoes.map((v) => tok(v.tamanho))).filter(
        (t) => t !== SEM,
      )
    : []

  // Cores do PRODUTO (chips multi-seleção), das variações do tamanho
  // escolhido.
  const cores = produto
    ? distintos(
        produto.variacoes
          .filter((v) => !tamanho || tok(v.tamanho) === tamanho)
          .map((v) => v.cor)
          .filter((c): c is string => Boolean(c)),
      )
    : []

  // Cores disponíveis de um produto do kit (por item).
  function coresDoProduto(produtoId: string): string[] {
    const p = produtos.find((x) => x.id === produtoId)
    return distintos(
      (p?.variacoes ?? [])
        .map((v) => v.cor)
        .filter((c): c is string => Boolean(c)),
    )
  }

  function trocarOrigem(v: string) {
    setOrigem(v)
    setTamanho('')
    setCoresSel(new Set())
    setCoresKit({})
  }

  function toggleCor(cor: string) {
    setCoresSel((prev) => {
      const next = new Set(prev)
      if (next.has(cor)) next.delete(cor)
      else next.add(cor)
      return next
    })
  }

  function descricaoDe(cor?: string): string {
    const base = produto
      ? `${produto.nome}${tamanho ? ` ${tamanho}` : ''}`
      : (kit?.nome ?? '')
    return cor ? `${base} - ${cor}` : base
  }

  // Kit: monta a descrição com a cor de CADA item. Se todos os itens têm
  // a mesma cor, resume ("Kit X - Terracota"); senão, detalha por item.
  function descricaoKit(): string {
    if (!kit) return ''
    const partes = kit.itens
      .filter((it) => coresDoProduto(it.produtoId).length > 0)
      .map((it) => ({
        nome: it.produtoNome,
        cor: coresKit[it.id] ?? '',
      }))
    const cores = distintos(partes.map((p) => p.cor).filter(Boolean))
    if (cores.length === 0) return kit.nome
    if (cores.length === 1) return `${kit.nome} - ${cores[0]}`
    return `${kit.nome} - ${partes
      .filter((p) => p.cor)
      .map((p) => `${p.nome}: ${p.cor}`)
      .join(' · ')}`
  }

  function adicionar() {
    if (!produto && !kit) return
    const quantidade = qtd || '1'

    let linhas: LinhaItem[]
    if (kit) {
      // Exige a cor de cada item que tem cores disponíveis.
      const faltando = kit.itens.some(
        (it) => coresDoProduto(it.produtoId).length > 0 && !coresKit[it.id],
      )
      if (faltando) {
        toast.error('Escolha a cor de cada item do kit')
        return
      }
      const descricao = descricaoKit()
      const daMemoria = precos[descricao]
      linhas = [
        {
          descricao,
          quantidade,
          preco: preco || (daMemoria ? decimalParaMoeda(daMemoria) : ''),
        },
      ]
    } else {
      const listaCores = coresSel.size > 0 ? [...coresSel] : [undefined]
      linhas = listaCores.map((cor) => {
        const descricao = descricaoDe(cor)
        // Preço digitado vale pra todas; em branco, usa a memória por item.
        const daMemoria = precos[descricao]
        return {
          descricao,
          quantidade,
          preco: preco || (daMemoria ? decimalParaMoeda(daMemoria) : ''),
        }
      })
    }
    onAdd(linhas)
    setCoresSel(new Set())
  }

  const nLinhas = kit ? 1 : coresSel.size > 0 ? coresSel.size : 1

  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Adicionar do catálogo
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select
          value={origem || undefined}
          onValueChange={(v) => trocarOrigem(v ?? '')}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Produto ou kit" />
          </SelectTrigger>
          {/* Popup mais largo que o campo pra nomes longos de kit. */}
          <SelectContent className="w-auto min-w-(--anchor-width) max-w-[92vw]">
            {produtos.map((p) => (
              <SelectItem key={p.id} value={`p:${p.id}`}>
                {p.nome}
              </SelectItem>
            ))}
            {kits.map((k) => (
              <SelectItem key={k.id} value={`k:${k.id}`}>
                {/^kit/i.test(k.nome.trim()) ? k.nome : `Kit — ${k.nome}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {produto && tamanhos.length > 0 && (
          <Select
            value={tamanho || undefined}
            onValueChange={(v) => {
              setTamanho(v ?? '')
              setCoresSel(new Set())
            }}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Tamanho" />
            </SelectTrigger>
            <SelectContent>
              {tamanhos.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {produto && cores.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cores.map((cor) => {
            const ativa = coresSel.has(cor)
            return (
              <button
                key={cor}
                type="button"
                onClick={() => toggleCor(cor)}
                disabled={disabled}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  ativa
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                {cor}
              </button>
            )
          })}
        </div>
      )}

      {/* Kit: cor escolhida item a item (cada item pode ter cor própria) */}
      {kit && (
        <div className="space-y-1.5">
          {kit.itens.map((it) => {
            const opcoes = coresDoProduto(it.produtoId)
            if (opcoes.length === 0) return null
            return (
              <div
                key={it.id}
                className="grid grid-cols-[1fr_10rem] items-center gap-2"
              >
                <span className="text-muted-foreground truncate text-xs">
                  {it.quantidade}× {it.produtoNome}
                </span>
                <Select
                  value={coresKit[it.id] || undefined}
                  onValueChange={(v) =>
                    setCoresKit((prev) => ({ ...prev, [it.id]: v ?? '' }))
                  }
                  disabled={disabled}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder="Cor" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
      )}

      {(produto || kit) && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            inputMode="numeric"
            aria-label="Quantidade por item"
            placeholder="qtd"
            value={qtd}
            onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))}
            disabled={disabled}
            className="h-9 w-16 text-center"
          />
          <div className="relative">
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs">
              R$
            </span>
            <Input
              aria-label="Preço unitário (opcional — usa o último preço)"
              inputMode="decimal"
              placeholder="último preço"
              value={preco}
              onChange={(e) => setPreco(mascararMoeda(e.target.value))}
              disabled={disabled}
              className="h-9 w-32 pl-7 text-right"
            />
          </div>
          <Button size="sm" onClick={adicionar} disabled={disabled}>
            <Plus />
            Adicionar {nLinhas > 1 ? `${nLinhas} itens` : 'item'}
          </Button>
        </div>
      )}
    </div>
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
