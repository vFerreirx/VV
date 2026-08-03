'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ClipboardList,
  Copy,
  FileSignature,
  FileText,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { Fragment, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  alternarStatusOrcamentoAction,
  atualizarOrcamentoAction,
  criarOrcamentoAction,
  excluirOrcamentoAction,
  obterOrcamento,
  type OrcamentoListItem,
} from './actions'
import type { CompradorOpcao } from '../compradores/actions'
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
  // Compradores cadastrados (vínculo opcional). Vem vazio quando o cargo não
  // tem acesso à área de compradores.
  compradores: CompradorOpcao[]
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
  compradores,
  podeEditar,
}: Props) {
  const [editando, setEditando] = useState<Edicao | null>(null)
  const [excluindo, setExcluindo] = useState<OrcamentoListItem | null>(null)
  const [mesSel, setMesSel] = useState('todos')

  // Agrupa por mês/ano de criação, mantendo a ordem de chegada (a lista já
  // vem por número desc, ou seja, mês mais recente primeiro).
  const gruposMes = useMemo(() => {
    const mapa = new Map<string, { label: string; itens: OrcamentoListItem[] }>()
    for (const o of orcamentos) {
      const d = new Date(o.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!mapa.has(key)) {
        const label = format(d, 'MMMM yyyy', { locale: ptBR })
        mapa.set(key, {
          label: label.charAt(0).toUpperCase() + label.slice(1),
          itens: [],
        })
      }
      mapa.get(key)!.itens.push(o)
    }
    return mapa
  }, [orcamentos])

  const meses = useMemo(
    () => [...gruposMes.entries()].map(([key, g]) => ({ key, label: g.label })),
    [gruposMes],
  )

  const gruposFiltrados = useMemo(() => {
    const entradas = [...gruposMes.entries()]
    return mesSel === 'todos'
      ? entradas
      : entradas.filter(([key]) => key === mesSel)
  }, [gruposMes, mesSel])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pedidos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monte o pedido pro cliente e imprima/envie em PDF.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setEditando({ modo: 'novo' })}>
            <Plus />
            Fazer pedido
          </Button>
        )}
      </div>

      {orcamentos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum pedido"
          description="Clique em “Fazer pedido” pra montar o primeiro."
        />
      ) : (
        <>
          <div className="flex justify-end">
            <Select
              value={mesSel}
              onValueChange={(v) => setMesSel(v ?? 'todos')}
            >
              <SelectTrigger size="sm" className="w-48">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {meses.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Nº</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {gruposFiltrados.map(([key, grupo]) => (
                  <Fragment key={key}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        colSpan={7}
                        className="text-muted-foreground py-2 text-xs font-semibold tracking-wide uppercase"
                      >
                        {grupo.label}
                      </TableCell>
                    </TableRow>
                    {grupo.itens.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">
                          #{o.numero}
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/pedidos/${o.id}`}
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
                        <TableCell>
                          <StatusBadge orcamento={o} podeEditar={podeEditar} />
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
                              render={<Link href={`/pedidos/${o.id}`} />}
                              aria-label="Abrir / imprimir"
                              title="Abrir / imprimir"
                            >
                              <Printer />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              render={
                                <Link href={`/pedidos/${o.id}/separacao`} />
                              }
                              aria-label="Via de separação"
                              title="Via de separação (sem preço)"
                            >
                              <ClipboardList />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              render={
                                <Link href={`/pedidos/${o.id}/romaneio`} />
                              }
                              aria-label="Romaneio de retirada"
                              title="Romaneio de retirada (com valores e assinatura)"
                            >
                              <FileSignature />
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
                                  title="Duplicar (novo pedido com os mesmos itens)"
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
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {editando && (
        <OrcamentoDialog
          edicao={editando}
          produtos={produtos}
          kits={kits}
          precos={precos}
          clientes={clientes}
          compradores={compradores}
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

// Snapshot de um componente do kit (quantidade é POR KIT). Espelha
// KitComponenteSnapshot de src/lib/db/schema/orcamentos.ts.
type KitComponente = {
  produtoNome: string
  cor: string | null
  quantidade: number
  tamanho?: string | null
}

type LinhaItem = {
  descricao: string
  quantidade: string
  preco: string
  kitId?: string | null
  tamanho?: string | null
  componentes?: KitComponente[] | null
}

const LINHA_VAZIA: LinhaItem = { descricao: '', quantidade: '1', preco: '' }

function OrcamentoDialog({
  edicao,
  produtos,
  kits,
  precos,
  clientes,
  compradores,
  onClose,
}: {
  edicao: Edicao
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  precos: Record<string, string>
  clientes: string[]
  compradores: CompradorOpcao[]
  onClose: () => void
}) {
  // 'duplicar' carrega os dados mas salva como orçamento NOVO.
  const isEdit = edicao.modo === 'editar'
  const precisaCarregar = edicao.modo !== 'novo' && edicao.id != null
  const [isPending, startTransition] = useTransition()
  const [carregado, setCarregado] = useState(!precisaCarregar)
  const [cliente, setCliente] = useState('')
  // Vínculo opcional com o cadastro. Digitar um nome livre no campo de texto
  // limpa o vínculo — o `cliente` continua sendo o que vai pro documento.
  const [compradorId, setCompradorId] = useState<string | null>(null)
  const [observacao, setObservacao] = useState('')
  const [itens, setItens] = useState<LinhaItem[]>([{ ...LINHA_VAZIA }])

  // Editar/duplicar: carrega o orçamento uma vez ao abrir (flag vira true
  // sincronamente, então o fetch dispara só na primeira renderização).
  if (precisaCarregar && !carregado) {
    setCarregado(true)
    void obterOrcamento(edicao.id!).then((o) => {
      if (!o) {
        toast.error('Pedido não encontrado')
        onClose()
        return
      }
      setCliente(o.cliente)
      setCompradorId(o.compradorId)
      setObservacao(o.observacao ?? '')
      setItens(
        o.itens.map((it) => ({
          descricao: it.descricao,
          quantidade: String(it.quantidade),
          preco: decimalParaMoeda(it.precoUnitario),
          kitId: it.kitId,
          tamanho: it.tamanho,
          componentes: it.kitComponentes as KitComponente[] | null,
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
        kitId: l.kitId ?? null,
        tamanho: l.tamanho ?? null,
        componentes: l.componentes ?? null,
      }))
    if (itensLimpos.length === 0) {
      toast.error('Adicione ao menos um item')
      return
    }

    startTransition(async () => {
      const payload = {
        cliente,
        compradorId,
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
              ? 'Editar pedido'
              : edicao.modo === 'duplicar'
                ? 'Duplicar pedido'
                : 'Fazer pedido'}
          </DialogTitle>
          <DialogDescription>
            Itens com quantidade e preço unitário. Puxe um produto do
            catálogo ou escreva a descrição livre.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto p-6">
          {/* Comprador do cadastro: opcional. Escolher preenche o nome
              abaixo e grava o vínculo; digitar livre continua valendo. */}
          {compradores.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="orc-comprador">
                Comprador cadastrado{' '}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </Label>
              <div className="flex gap-2">
                <Select
                  // `null` em vez de undefined: com undefined o Base UI trata
                  // o Select como uncontrolled e não mostraria o comprador de
                  // um orçamento carregado pra edição.
                  value={compradorId}
                  onValueChange={(v) => {
                    if (!v) return
                    const c = compradores.find((x) => x.id === v)
                    if (!c) return
                    setCompradorId(c.id)
                    setCliente(c.nome)
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger id="orc-comprador" className="w-full">
                    <SelectValue placeholder="Escolher do cadastro…" />
                  </SelectTrigger>
                  <SelectContent className="w-auto min-w-(--anchor-width) max-w-[92vw]">
                    {compradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {compradorId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCompradorId(null)}
                    disabled={isPending}
                    aria-label="Desvincular comprador"
                    title="Desvincular (mantém o nome digitado)"
                  >
                    <X />
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="orc-cliente">Cliente</Label>
            <Input
              id="orc-cliente"
              value={cliente}
              onChange={(e) => {
                setCliente(e.target.value)
                // Nome editado à mão desfaz o vínculo com o cadastro.
                setCompradorId(null)
              }}
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
              placeholder="Condições, prazo de entrega, validade do pedido…"
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
  // Fluxo em 2 passos: 1º escolhe o MODELO, 2º o produto/kit daquele modelo.
  const [modeloSel, setModeloSel] = useState('')
  // origem: 'p:<id>' (produto) ou 'k:<id>' (kit)
  const [origem, setOrigem] = useState('')
  const [tamanho, setTamanho] = useState('')
  const [coresSel, setCoresSel] = useState<Set<string>>(new Set())
  // Kit: cor escolhida POR ITEM do kit (kitItemId -> cor) — cada item pode
  // ter cor própria (ex.: capa numa cor, manta noutra).
  const [coresKit, setCoresKit] = useState<Record<string, string>>({})
  // Kit: tamanho ÚNICO pro kit inteiro (não é por item).
  const [tamanhoKit, setTamanhoKit] = useState('')
  const [qtd, setQtd] = useState('1')
  const [preco, setPreco] = useState('')

  const produto = origem.startsWith('p:')
    ? produtos.find((p) => p.id === origem.slice(2))
    : undefined
  const kit = origem.startsWith('k:')
    ? kits.find((k) => k.id === origem.slice(2))
    : undefined

  const SEM_MODELO = 'Sem modelo'
  const modeloDoProduto = (p: ProdutoComVariacoesParaForm): string =>
    p.variacoes.find((v) => v.modelo)?.modelo ?? SEM_MODELO
  const modeloDoKit = (k: KitComItens): string => {
    for (const it of k.itens) {
      const p = produtos.find((x) => x.id === it.produtoId)
      const m = p?.variacoes.find((v) => v.modelo)?.modelo
      if (m) return m
    }
    return SEM_MODELO
  }
  // Remove o sufixo " - MODELO" do nome (redundante dentro do grupo).
  const semSufixoModelo = (nome: string, modelo: string): string => {
    const re = new RegExp(`\\s*[-–]\\s*${modelo}\\s*$`, 'i')
    return nome.replace(re, '').trim()
  }

  // Modelos que têm ao menos um produto/kit, em ordem.
  const modelos = distintos([
    ...produtos.map(modeloDoProduto),
    ...kits.map(modeloDoKit),
  ]).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const produtosDoModelo = produtos.filter(
    (p) => modeloDoProduto(p) === modeloSel,
  )
  const kitsDoModelo = kits.filter((k) => modeloDoKit(k) === modeloSel)

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

  // Tamanhos de um produto do kit (por item).
  function tamanhosDoProduto(produtoId: string): string[] {
    const p = produtos.find((x) => x.id === produtoId)
    return distintos(
      (p?.variacoes ?? [])
        .map((v) => v.tamanho)
        .filter((t): t is string => Boolean(t)),
    )
  }

  // Tamanhos oferecidos pro kit inteiro (um seletor só). Só entram os
  // tamanhos dos componentes que TÊM escolha de tamanho (2+ opções) — no
  // catálogo real capa é sempre 45x45, manta sempre Manta e baguete sempre
  // Baguete; o único componente com tamanho variável é a peseira
  // (Casal/King/Queen). Oferecer a união crua faria escolher "45x45" como
  // "tamanho do kit", que não quer dizer nada.
  const tamanhosKit = kit
    ? distintos(
        kit.itens.flatMap((it) => {
          const ts = tamanhosDoProduto(it.produtoId)
          return ts.length > 1 ? ts : []
        }),
      )
    : []

  // Resolve o tamanho DESTE componente a partir da escolha única do kit:
  // usa o tamanho do kit quando o componente tem esse tamanho; senão, se o
  // componente só tem um tamanho possível, é ele (capa 45x45, manta Manta).
  function tamanhoDoComponente(produtoId: string): string | null {
    const ts = tamanhosDoProduto(produtoId)
    if (tamanhoKit && ts.includes(tamanhoKit)) return tamanhoKit
    if (ts.length === 1) return ts[0]
    return null
  }

  function trocarModelo(m: string) {
    setModeloSel(m)
    setOrigem('')
    setTamanho('')
    setCoresSel(new Set())
    setCoresKit({})
    setTamanhoKit('')
  }

  function trocarOrigem(v: string) {
    setOrigem(v)
    setTamanho('')
    setCoresSel(new Set())
    setCoresKit({})
    setTamanhoKit('')
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

  // Kit: monta a descrição com o tamanho do kit + a cor de CADA item. Se
  // todos os itens têm a mesma cor, resume ("Kit X M - Terracota"); senão,
  // detalha por item.
  function descricaoKit(): string {
    if (!kit) return ''
    const base = tamanhoKit ? `${kit.nome} ${tamanhoKit}` : kit.nome
    const partes = kit.itens
      .filter((it) => coresDoProduto(it.produtoId).length > 0)
      .map((it) => ({
        nome: it.produtoNome,
        cor: coresKit[it.id] ?? '',
      }))
    const cores = distintos(partes.map((p) => p.cor).filter(Boolean))
    if (cores.length === 0) return base
    if (cores.length === 1) return `${base} - ${cores[0]}`
    return `${base} - ${partes
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
      // Snapshot dos componentes (quantidade é POR KIT) — a via de
      // separação multiplica pela quantidade deste item na hora de montar.
      const componentes: KitComponente[] = kit.itens.map((it) => ({
        produtoNome: it.produtoNome,
        cor: coresKit[it.id] || null,
        quantidade: it.quantidade,
        tamanho: tamanhoDoComponente(it.produtoId),
      }))
      linhas = [
        {
          descricao,
          quantidade,
          preco: preco || (daMemoria ? decimalParaMoeda(daMemoria) : ''),
          kitId: kit.id,
          tamanho: tamanhoKit || null,
          componentes,
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
        {/* 1º passo: modelo */}
        <Select
          value={modeloSel || undefined}
          onValueChange={(v) => trocarModelo(v ?? '')}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Modelo" />
          </SelectTrigger>
          <SelectContent className="w-auto min-w-(--anchor-width) max-w-[92vw]">
            {modelos.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 2º passo: produto ou kit daquele modelo */}
        {modeloSel && (
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
              {produtosDoModelo.map((p) => (
                <SelectItem key={p.id} value={`p:${p.id}`}>
                  {semSufixoModelo(p.nome, modeloSel)}
                </SelectItem>
              ))}
              {kitsDoModelo.map((k) => (
                <SelectItem key={k.id} value={`k:${k.id}`}>
                  {semSufixoModelo(
                    /^kit/i.test(k.nome.trim()) ? k.nome : `Kit — ${k.nome}`,
                    modeloSel,
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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

        {/* Kit: tamanho único pro kit inteiro (vale pra todos os itens) */}
        {kit && tamanhosKit.length > 0 && (
          <Select
            value={tamanhoKit || undefined}
            onValueChange={(v) => setTamanhoKit(v ?? '')}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Tamanho do kit" />
            </SelectTrigger>
            <SelectContent>
              {tamanhosKit.map((t) => (
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
          <DialogTitle>Excluir pedido?</DialogTitle>
          <DialogDescription>
            O pedido #{orcamento?.numero} de {orcamento?.cliente} será
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

// -----------------------------------------------------------------
// Badge de status — clicável, alterna aguardando <-> aprovado
// -----------------------------------------------------------------

function StatusBadge({
  orcamento,
  podeEditar,
}: {
  orcamento: OrcamentoListItem
  podeEditar: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const aprovado = orcamento.status === 'aprovado'

  function alternar() {
    startTransition(async () => {
      const result = await alternarStatusOrcamentoAction(orcamento.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Atualizado')
    })
  }

  return (
    <button
      type="button"
      onClick={podeEditar ? alternar : undefined}
      disabled={isPending || !podeEditar}
      title={podeEditar ? 'Clique pra alternar' : undefined}
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors',
        aprovado
          ? 'bg-emerald-500/15 text-emerald-600'
          : 'bg-amber-500/15 text-amber-600',
        podeEditar && !isPending && 'hover:opacity-70',
        isPending && 'opacity-60',
      )}
    >
      {aprovado ? 'Aprovado' : 'Aguardando'}
    </button>
  )
}
