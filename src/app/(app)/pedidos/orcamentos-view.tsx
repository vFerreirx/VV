'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronDown,
  ClipboardList,
  Copy,
  FileSignature,
  FileText,
  PackageX,
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
  atualizarOrcamentoAction,
  criarOrcamentoAction,
  excluirOrcamentoAction,
  mudarStatusOrcamentoAction,
  obterOrcamento,
  type OrcamentoComItens,
  type OrcamentoListItem,
} from './actions'
import type { CompradorOpcao } from '../clientes/actions'
import type { KitComItens } from '../kits/actions'
import type { ProdutoComVariacoesParaForm } from '../ordens/actions'
import {
  descontoEmCentavos,
  freteEmCentavos,
  temDesconto,
  temFrete,
  totalFinal,
} from '@/lib/total-pedido'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useListaAnimada } from '@/components/ui/use-lista-animada'
import { cn } from '@/lib/utils'
import {
  chaveDeTamanhos,
  componentesVariaveis,
  tamanhoDoComponente as resolverTamanhoComponente,
  tamanhoDoKit,
  type EscolhasDeTamanho,
} from '@/lib/kit-tamanhos'
import { ehExcecao, ROTULO_STATUS, statusAlcancaveis, type StatusPedido } from '@/lib/pedido-status'
import { centavosParaMoeda, precoDeKit, precoDeProduto, type TabelaDePrecos } from '@/lib/preco'
import {
  DESCONTO_PIX_PADRAO,
  FORMAS_PAGAMENTO,
  ROTULO_FORMA,
  type FormaPagamento,
} from '@/lib/pagamento'
import { formatarNumeroPedido } from '@/lib/validators/orcamentos'

type Props = {
  orcamentos: OrcamentoListItem[]
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  // Último preço usado por descrição (pré-preenche ao puxar do catálogo).
  // É a RESERVA: só vale onde não há preço de tabela cadastrado.
  precos: Record<string, string>
  // Preço de TABELA do catálogo (produto/kit × tamanho). Primeira escolha.
  tabela: TabelaDePrecos
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

// Editar/duplicar só existe COM os dados já carregados: a busca acontece no
// clique, antes de abrir o diálogo. Antes ela era disparada no meio do render
// do diálogo, e chamar uma server action ali faz o Router atualizar enquanto
// outro componente renderiza — o React avisava
// "Cannot update a component (Router) while rendering a different component".
// De quebra, sumiu o formulário vazio que piscava até os dados chegarem.
type Edicao =
  | { modo: 'novo' }
  | { modo: 'editar' | 'duplicar'; id: string; dados: OrcamentoComItens }

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
  tabela,
  clientes,
  compradores,
  podeEditar,
}: Props) {
  const [editando, setEditando] = useState<Edicao | null>(null)
  const [excluindo, setExcluindo] = useState<OrcamentoListItem | null>(null)
  const [mesSel, setMesSel] = useState('todos')
  // Id em carregamento, pra desabilitar só a linha clicada.
  const [abrindo, setAbrindo] = useState<string | null>(null)

  // Busca o pedido e SÓ ENTÃO abre o diálogo.
  function abrirEdicao(modo: 'editar' | 'duplicar', id: string) {
    setAbrindo(id)
    void obterOrcamento(id)
      .then((dados) => {
        if (!dados) {
          toast.error('Pedido não encontrado')
          return
        }
        setEditando({ modo, id, dados })
      })
      .finally(() => setAbrindo(null))
  }

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
    return mesSel === 'todos' ? entradas : entradas.filter(([key]) => key === mesSel)
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
            <Select value={mesSel} onValueChange={(v) => setMesSel(v ?? 'todos')}>
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
                          #{formatarNumeroPedido(o.numero)}
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link href={`/pedidos/${o.id}`} className="hover:underline">
                            {o.cliente}
                          </Link>
                          {/* Indicador DISCRETO de item faltante. Sem ele,
                              descobrir o que está esperando produção exige
                              abrir pedido por pedido. Só o aviso: filtrar por
                              isso ficou de fora desta rodada. */}
                          {o.faltantes > 0 && (
                            <Link
                              href={`/pedidos/${o.id}/faltantes`}
                              title={`${o.faltantes} peça(s) faltando — ver a via de faltantes`}
                              className="ml-2 inline-flex translate-y-0.5 items-center gap-1 align-baseline text-xs font-normal text-amber-700 hover:underline dark:text-amber-400"
                            >
                              <PackageX className="size-3.5" />
                              {o.faltantes}
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {format(new Date(o.createdAt), 'dd/MM/yyyy', {
                            locale: ptBR,
                          })}
                        </TableCell>
                        <TableCell>
                          <StatusBadge orcamento={o} podeEditar={podeEditar} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{o.itensCount}</TableCell>
                        {/* COM frete, e sem coluna separada pra ele — foi
                            decidido assim. `o.total` (mercadoria) continua
                            existindo pra quem precisa dele.

                            E SEM O DESCONTO, também de propósito: esta coluna
                            é `totalComFrete` e não `o.totalFinal`. Não é bug
                            — o documento do pedido é que mostra o que o
                            cliente paga. */}
                        <TableCell className="text-right font-medium tabular-nums">
                          {reais(o.totalComFrete)}
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
                              render={<Link href={`/pedidos/${o.id}/separacao`} />}
                              aria-label="Via de separação"
                              title="Via de separação (sem preço)"
                            >
                              <ClipboardList />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              render={<Link href={`/pedidos/${o.id}/romaneio`} />}
                              aria-label="Romaneio"
                              title="Romaneio (com valores e assinatura)"
                            >
                              <FileSignature />
                            </Button>
                            {podeEditar && (
                              <>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => abrirEdicao('duplicar', o.id)}
                                  disabled={abrindo === o.id}
                                  aria-label="Duplicar"
                                  title="Duplicar (novo pedido com os mesmos itens)"
                                >
                                  <Copy />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => abrirEdicao('editar', o.id)}
                                  disabled={abrindo === o.id}
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
          tabela={tabela}
          clientes={clientes}
          compradores={compradores}
          onClose={() => setEditando(null)}
        />
      )}
      <ExcluirDialog orcamento={excluindo} onClose={() => setExcluindo(null)} />
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
  produtoId?: string | null
}

type LinhaItem = {
  // Chave estável da linha. Com `key={idx}` o React reaproveita o <div> ao
  // remover uma linha do meio, e o auto-animate acabava animando a saída da
  // ÚLTIMA linha em vez da que foi apagada.
  id: string
  descricao: string
  quantidade: string
  preco: string
  kitId?: string | null
  // Produto do catálogo e tamanho da linha AVULSA. Não aparecem na tela:
  // existem pra resolver o peso sem depender do texto da descrição.
  produtoId?: string | null
  tamanho?: string | null
  componentes?: KitComponente[] | null
}

// Contador de módulo em vez de crypto.randomUUID(): a chave nunca vai pro
// HTML, então não precisa ser global — só precisa não repetir na sessão.
let seqLinha = 0
const novaLinhaId = () => `linha-${++seqLinha}`

const linhaVazia = (): LinhaItem => ({
  id: novaLinhaId(),
  descricao: '',
  quantidade: '1',
  preco: '',
})

function OrcamentoDialog({
  edicao,
  produtos,
  kits,
  precos,
  tabela,
  clientes,
  compradores,
  onClose,
}: {
  edicao: Edicao
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  precos: Record<string, string>
  tabela: TabelaDePrecos
  clientes: string[]
  compradores: CompradorOpcao[]
  onClose: () => void
}) {
  // 'duplicar' carrega os dados mas salva como orçamento NOVO.
  const isEdit = edicao.modo === 'editar'
  // Já vem carregado de fora: quem clicou em editar/duplicar buscou o pedido
  // antes de abrir. Aqui é só o estado inicial dos campos.
  const dados = edicao.modo === 'novo' ? null : edicao.dados
  const [isPending, startTransition] = useTransition()
  const [cliente, setCliente] = useState(dados?.cliente ?? '')
  // Vínculo opcional com o cadastro. Digitar um nome livre no campo de texto
  // limpa o vínculo — o `cliente` continua sendo o que vai pro documento.
  const [compradorId, setCompradorId] = useState<string | null>(dados?.compradorId ?? null)
  const [observacao, setObservacao] = useState(dados?.observacao ?? '')
  // FRETE DIGITADO: campo comum, editável sempre. Cotar pelo Melhor Envio
  // (na tela do pedido) é ATALHO — a cotação escolhida preenche esta mesma
  // coluna, e digitar por cima é o caso normal, não uma exceção.
  const [frete, setFrete] = useState(dados?.freteValor ? decimalParaMoeda(dados.freteValor) : '')
  // PAGAMENTO COMBINADO. Os dois opcionais: `null`/'' é "não informado", que
  // é o que faz o documento não dizer nada sobre pagamento nem imprimir linha
  // de desconto. Ver src/lib/pagamento.ts.
  const [pagamentoForma, setPagamentoForma] = useState<FormaPagamento | null>(
    dados?.pagamentoForma ?? null,
  )
  const [desconto, setDesconto] = useState(
    dados?.descontoPercentual == null
      ? ''
      : String(Number(dados.descontoPercentual)).replace('.', ','),
  )
  const [itens, setItens] = useState<LinhaItem[]>(() =>
    dados
      ? dados.itens.map((it) => ({
          id: novaLinhaId(),
          descricao: it.descricao,
          quantidade: String(it.quantidade),
          preco: decimalParaMoeda(it.precoUnitario),
          kitId: it.kitId,
          produtoId: it.produtoId,
          tamanho: it.tamanho,
          componentes: it.kitComponentes as KitComponente[] | null,
        }))
      : [linhaVazia()],
  )

  const [listaItens] = useListaAnimada<HTMLDivElement>()

  function patchItem(idx: number, patch: Partial<LinhaItem>) {
    setItens((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  // Nova linha; com descrição do catálogo, já puxa o último preço usado.
  function addItem(descricao = '') {
    const precoSalvo = descricao ? precos[descricao] : undefined
    setItens((prev) => [
      ...prev,
      {
        ...linhaVazia(),
        descricao,
        preco: precoSalvo ? decimalParaMoeda(precoSalvo) : '',
      },
    ])
  }
  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  const total = itens.reduce(
    (s, l) => s + (Number(l.quantidade) || 0) * Number(moedaParaDecimal(l.preco) || 0),
    0,
  )
  const totalUnidades = itens.reduce(
    (s, l) => s + (l.descricao.trim() ? Number(l.quantidade) || 0 : 0),
    0,
  )
  // `total` continua sendo A MERCADORIA; o que o cliente paga é derivado.
  // Mesma regra do servidor — src/lib/total-pedido.ts. O número daqui tem que
  // ser o MESMO do documento: um total no diálogo diferente do total impresso
  // é o tipo de divergência que só aparece na frente do cliente.
  const freteDecimal = moedaParaDecimal(frete)
  const descontoDecimal = desconto === '' ? null : desconto.replace(',', '.')
  const descontoReais = descontoEmCentavos(total, descontoDecimal) / 100
  const totalGeral = totalFinal(total, freteDecimal, descontoDecimal)

  // Escolher Pix sugere o desconto padrão SÓ COM O CAMPO VAZIO, e trocar de
  // forma nunca apaga o que já foi digitado: quem negociou 7% no Pix, ou 5%
  // no boleto, não pode ver a tela desfazer isso.
  function escolherForma(f: FormaPagamento | null) {
    setPagamentoForma(f)
    if (f === 'pix' && desconto.trim() === '') {
      setDesconto(String(DESCONTO_PIX_PADRAO))
    }
  }

  // O valor gravado veio de uma cotação enquanto a procedência estiver lá E o
  // campo ainda mostrar aquele mesmo número. Editou, virou digitado — e a
  // action limpa a procedência ao salvar.
  const cotacaoDeOrigem =
    dados?.freteTransportadora &&
    freteEmCentavos(freteDecimal) === freteEmCentavos(dados.freteValor)
      ? `${dados.freteTransportadora}${dados.freteServico ? ` · ${dados.freteServico}` : ''}`
      : null

  function salvar() {
    const itensLimpos = itens
      .filter((l) => l.descricao.trim().length > 0)
      .map((l) => ({
        descricao: l.descricao.trim(),
        quantidade: Math.max(1, Number(l.quantidade) || 1),
        precoUnitario: moedaParaDecimal(l.preco) || '0',
        kitId: l.kitId ?? null,
        produtoId: l.produtoId ?? null,
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
        // Campo vazio vira null — "sem frete informado", que é o que faz a
        // linha não sair no documento do cliente. Nunca zero.
        freteValor: freteDecimal || null,
        // Mesma regra: vazio vira null — "não informado" —, nunca zero.
        pagamentoForma,
        descontoPercentual: descontoDecimal,
        itens: itensLimpos,
      }
      const result = isEdit
        ? await atualizarOrcamentoAction(edicao.id, payload)
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
            Itens com quantidade e preço unitário. Puxe um produto do catálogo ou escreva a
            descrição livre.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto p-6">
          {/* Cliente do cadastro: opcional. Escolher preenche o nome abaixo e
              grava o vínculo; digitar livre continua valendo.

              OS DOIS RÓTULOS SÃO IRMÃOS E PRECISAM SE DIFERENCIAR: este aqui
              ESCOLHE do cadastro (traz documento e endereço pro romaneio), e o
              de baixo é o NOME QUE SAI NO DOCUMENTO. Chamar os dois de
              "cliente" deixaria "Cliente cadastrado" logo acima de "Cliente",
              que é justamente a confusão que se quer evitar. */}
          {compradores.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="orc-comprador">
                Cliente do cadastro{' '}
                <span className="text-muted-foreground font-normal">(opcional)</span>
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
                  <SelectContent className="w-auto max-w-[92vw] min-w-(--anchor-width)">
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
                    aria-label="Desvincular cliente do cadastro"
                    title="Desvincular (mantém o nome digitado)"
                  >
                    <X />
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="orc-cliente">Nome no pedido</Label>
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
            {/* A segunda frase só faz sentido com o select acima na tela —
                quem não tem acesso à área de clientes não o enxerga. */}
            <p className="text-muted-foreground text-xs">
              É esse nome que sai no documento.
              {compradores.length > 0 &&
                ' Escolher do cadastro preenche este campo; editar à mão desfaz o vínculo.'}
            </p>
          </div>

          {/* Builder: produto/kit + tamanho + VÁRIAS cores de uma vez */}
          <CatalogoBuilder
            produtos={produtos}
            kits={kits}
            precos={precos}
            tabela={tabela}
            disabled={isPending}
            onAdd={(novas) =>
              setItens((prev) => {
                // Substitui a linha inicial vazia, se for a única.
                const base = prev.length === 1 && !prev[0].descricao && !prev[0].preco ? [] : prev
                return [...base, ...novas]
              })
            }
          />

          <div className="space-y-2">
            <Label>Itens</Label>

            {/* O ref vai num wrapper só das linhas: o auto-animate anima os
                FILHOS DIRETOS, e com o <Label> e o botão aqui dentro ele
                trataria os dois como itens da lista. */}
            <div ref={listaItens} className="space-y-2">
              {itens.map((linha, idx) => (
                <div
                  key={linha.id}
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
                      onChange={(e) => patchItem(idx, { preco: mascararMoeda(e.target.value) })}
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
            </div>
            <Button size="sm" variant="outline" onClick={() => addItem()} disabled={isPending}>
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

        <DialogFooter className="flex-col items-stretch gap-3 border-t p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="orc-frete" className="text-xs">
                Frete <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <div className="relative">
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs">
                  R$
                </span>
                <Input
                  id="orc-frete"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={frete}
                  onChange={(e) => setFrete(mascararMoeda(e.target.value))}
                  disabled={isPending}
                  className="h-9 w-32 pl-7 text-right tabular-nums"
                />
              </div>
            </div>
            {/* PAGAMENTO COMBINADO, ao lado do frete porque é a mesma
                pergunta: quanto o cliente paga, e como. Escolher Pix sugere
                os 5% quando o campo está vazio — e só nesse caso. */}
            <div className="space-y-1.5">
              <Label htmlFor="orc-pagamento" className="text-xs">
                Pagamento <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Select
                // O token `SEM` é o "não informado": o Base UI precisa de uma
                // string, e a ausência é o valor `null` que vai pro banco.
                value={pagamentoForma ?? SEM}
                onValueChange={(v) => {
                  if (!v) return
                  escolherForma(v === SEM ? null : (v as FormaPagamento))
                }}
                disabled={isPending}
              >
                <SelectTrigger id="orc-pagamento" className="h-9 w-36">
                  <SelectValue placeholder="Não informado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Não informado</SelectItem>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f} value={f}>
                      {ROTULO_FORMA[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orc-desconto" className="text-xs">
                Desconto <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="orc-desconto"
                  inputMode="decimal"
                  placeholder="0"
                  value={desconto}
                  onChange={(e) =>
                    setDesconto(e.target.value.replace(/[^\d,.]/g, '').replace('.', ','))
                  }
                  disabled={isPending}
                  className="h-9 w-24 pr-7 text-right tabular-nums"
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                  %
                </span>
              </div>
            </div>
            {/* Discriminado: um total diferente da soma dos itens sem
                explicação vira ligação do cliente. E é o MESMO número do
                documento — se divergirem, a divergência aparece na frente do
                cliente. */}
            <div className="pb-1 text-sm leading-tight">
              <div className="text-muted-foreground text-xs">
                {totalUnidades.toLocaleString('pt-BR')} un · produtos{' '}
                <span className="tabular-nums">{reais(total)}</span>
                {temDesconto(descontoDecimal) && (
                  <>
                    {' · desconto '}
                    <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                      −{reais(descontoReais)} ({desconto}%)
                    </span>
                  </>
                )}
                {temFrete(freteDecimal) && (
                  <>
                    {' · frete '}
                    <span className="tabular-nums">{reais(Number(freteDecimal))}</span>
                  </>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Total: </span>
                <span className="font-semibold tabular-nums">{reais(totalGeral)}</span>
              </div>
              {/* De onde veio o número — sem isso ninguém sabe se é
                  estimativa ou combinado. */}
              {temFrete(freteDecimal) && (
                <div className="text-muted-foreground text-xs">
                  {cotacaoDeOrigem ? `Frete cotado: ${cotacaoDeOrigem}` : 'Frete informado à mão'}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button loading={isPending} onClick={salvar} disabled={isPending}>
              {'Salvar'}
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
  tabela,
  disabled,
  onAdd,
}: {
  produtos: ProdutoComVariacoesParaForm[]
  kits: KitComItens[]
  precos: Record<string, string>
  tabela: TabelaDePrecos
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
  // Kit: tamanho POR COMPONENTE (produtoId -> tamanho). Antes era um só pro
  // kit inteiro, e o componente que não tivesse aquele tamanho ficava sem
  // nenhum — ver o topo de src/lib/kit-tamanhos.ts.
  const [tamanhosKit, setTamanhosKit] = useState<EscolhasDeTamanho>({})
  const [qtd, setQtd] = useState('1')
  const [preco, setPreco] = useState('')

  const produto = origem.startsWith('p:')
    ? produtos.find((p) => p.id === origem.slice(2))
    : undefined
  const kit = origem.startsWith('k:') ? kits.find((k) => k.id === origem.slice(2)) : undefined

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
  const modelos = distintos([...produtos.map(modeloDoProduto), ...kits.map(modeloDoKit)]).sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  )

  const produtosDoModelo = produtos.filter((p) => modeloDoProduto(p) === modeloSel)
  const kitsDoModelo = kits.filter((k) => modeloDoKit(k) === modeloSel)

  // Tamanhos do produto (kits não têm tamanho no builder).
  const tamanhos = produto
    ? distintos(produto.variacoes.map((v) => tok(v.tamanho))).filter((t) => t !== SEM)
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
    return distintos((p?.variacoes ?? []).map((v) => v.cor).filter((c): c is string => Boolean(c)))
  }

  // Tamanhos de um produto do kit (por item).
  function tamanhosDoProduto(produtoId: string): string[] {
    const p = produtos.find((x) => x.id === produtoId)
    return distintos(
      (p?.variacoes ?? []).map((v) => v.tamanho).filter((t): t is string => Boolean(t)),
    )
  }

  // Quem precisa de seletor e qual tamanho cada componente recebe vêm de
  // src/lib/kit-tamanhos.ts — a MESMA regra que a tela de kits usa pra
  // decidir em que tamanho cabe um preço fechado. Se divergissem, um preço
  // cadastrado lá viraria preço que o pedido nunca alcança.
  const variaveis = kit ? componentesVariaveis(kit.itens, tamanhosDoProduto) : []

  function tamanhoDoComponente(produtoId: string): string | null {
    return resolverTamanhoComponente(produtoId, tamanhosKit, tamanhosDoProduto)
  }

  // Tamanho que representa o kit inteiro — só existe com exatamente um
  // componente variável. É o que vai pra `orcamento_itens.tamanho`.
  const tamanhoDoKitAtual = kit ? tamanhoDoKit(kit.itens, tamanhosKit, tamanhosDoProduto) : null

  // CHAVE DO PREÇO FECHADO, que NÃO é `tamanhoDoKitAtual`. As duas são
  // `string | null` e o TypeScript aceita uma no lugar da outra sem reclamar
  // — mas `tamanhoDoKitAtual` é null sempre que dois componentes variam, e
  // aí o preço cadastrado do Kit ACONCHEGO nunca seria encontrado. É o
  // "preço inalcançável sem ninguém perceber" que src/lib/kit-tamanhos.ts
  // existe pra impedir. A chave é a combinação, e vem de lá.
  const combinacaoDoKitAtual = kit
    ? chaveDeTamanhos(kit.itens, tamanhosKit, tamanhosDoProduto)
    : null

  function trocarModelo(m: string) {
    setModeloSel(m)
    setOrigem('')
    setTamanho('')
    setCoresSel(new Set())
    setCoresKit({})
    setTamanhosKit({})
  }

  function trocarOrigem(v: string) {
    setOrigem(v)
    setTamanho('')
    setCoresSel(new Set())
    setCoresKit({})
    setTamanhosKit({})
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
    const base = produto ? `${produto.nome}${tamanho ? ` ${tamanho}` : ''}` : (kit?.nome ?? '')
    return cor ? `${base} - ${cor}` : base
  }

  // Kit: monta a descrição com o(s) tamanho(s) + a cor de CADA item. Se
  // todos os itens têm a mesma cor, resume ("Kit X M - Terracota"); senão,
  // detalha por item.
  //
  // A descrição é CHAVE do `listarPrecosRecentes()` e sai nos documentos de
  // separação e romaneio, então tem que ser determinística: a ordem é sempre
  // a de `kit.itens` (que vem do banco ordenado por nome do produto), NUNCA a
  // ordem em que o usuário clicou.
  //
  // Com um componente variável só, o formato é o de sempre — "Kit X Queen" —
  // e as descrições antigas continuam batendo com a memória de preço. Com
  // dois ou mais não existe "o tamanho do kit", e aí cada um é nomeado:
  //   Kit Peseira+ 2 Capas de Almofada - ACONCHEGO
  //     (Capa de Almofada - ACONCHEGO: 50x50 · Peseira - ACONCHEGO: Queen)
  function descricaoKit(): string {
    if (!kit) return ''
    const porComponente =
      variaveis.length > 1
        ? kit.itens
            .filter((it) => variaveis.some((v) => v.id === it.id))
            .map((it) => `${it.produtoNome}: ${tamanhosKit[it.produtoId] ?? '?'}`)
            .join(' · ')
        : ''
    const base = porComponente
      ? `${kit.nome} (${porComponente})`
      : tamanhoDoKitAtual
        ? `${kit.nome} ${tamanhoDoKitAtual}`
        : kit.nome
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

  // Ordem da sugestão: o que o vendedor digitou no campo do builder vence
  // sempre (ele está dizendo o preço desta remessa); depois o PREÇO DE
  // TABELA do catálogo; e só então a reserva, que é o último preço praticado
  // naquela descrição. Nada disso trava: o campo da linha continua editável,
  // e é o que ficar lá que vira snapshot no pedido.
  function precoSugerido(daTabela: number | null, descricao: string): string {
    if (preco) return preco
    if (daTabela != null) return centavosParaMoeda(daTabela)
    const daMemoria = precos[descricao]
    return daMemoria ? decimalParaMoeda(daMemoria) : ''
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
      // E o tamanho de cada componente que tem mais de um. Sem isso a peça
      // entra no pedido sem tamanho, e sem tamanho não há peso nem preço.
      const semTamanho = variaveis.some((it) => !tamanhoDoComponente(it.produtoId))
      if (semTamanho) {
        toast.error('Escolha o tamanho de cada item do kit')
        return
      }
      const descricao = descricaoKit()
      // Snapshot dos componentes (quantidade é POR KIT) — a via de
      // separação multiplica pela quantidade deste item na hora de montar.
      const componentes: KitComponente[] = kit.itens.map((it) => ({
        produtoNome: it.produtoNome,
        cor: coresKit[it.id] || null,
        quantidade: it.quantidade,
        tamanho: tamanhoDoComponente(it.produtoId),
        // Só pro peso: o documento continua imprimindo o produtoNome.
        produtoId: it.produtoId,
      }))
      // Preço fechado do kit, senão a soma dos componentes (cada um no
      // tamanho dele). Os componentes já vêm com o tamanho resolvido acima —
      // é a mesma lista, não uma segunda regra.
      const daTabela = precoDeKit(
        tabela,
        kit.id,
        combinacaoDoKitAtual,
        kit.itens.map((it) => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          tamanho: tamanhoDoComponente(it.produtoId),
        })),
      )
      linhas = [
        {
          id: novaLinhaId(),
          descricao,
          quantidade,
          preco: precoSugerido(daTabela, descricao),
          kitId: kit.id,
          // Null com 2+ componentes variáveis: não existe um tamanho que
          // descreva o kit. A fonte real de cada peça é o snapshot dos
          // componentes, que agora sai sempre com tamanho.
          tamanho: tamanhoDoKitAtual,
          componentes,
        },
      ]
    } else {
      const listaCores = coresSel.size > 0 ? [...coresSel] : [undefined]
      const daTabela = precoDeProduto(tabela, produto?.id, tamanho || null)
      linhas = listaCores.map((cor) => {
        const descricao = descricaoDe(cor)
        return {
          id: novaLinhaId(),
          descricao,
          quantidade,
          preco: precoSugerido(daTabela, descricao),
          // Guardados só pra resolver o peso depois. Até aqui a linha
          // avulsa virava texto ("Peseira - ARAN King - Rose") e o peso só
          // podia ser adivinhado pela descrição — é o que ainda acontece
          // com as linhas antigas.
          produtoId: produto?.id ?? null,
          tamanho: tamanho || null,
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
          value={modeloSel || null}
          onValueChange={(v) => trocarModelo(v ?? '')}
          disabled={disabled}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Modelo" />
          </SelectTrigger>
          <SelectContent className="w-auto max-w-[92vw] min-w-(--anchor-width)">
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
            // O `key` REMONTA o select a cada modelo, e não é enfeite: trocar
            // de modelo zera `origem` E troca a lista inteira de itens no
            // MESMO render. O Select guarda uma referência ao item que ele
            // alinha com o gatilho ao abrir; com esse item desmontado no
            // mesmo commit, a conta de posição vai pro brejo e o popup abre
            // ~900px ABAIXO da janela. De fora parece que o campo parou de
            // abrir — o `aria-expanded` vira "true" e não há erro nenhum no
            // console. Era por isso que fechar e reabrir o pedido resolvia.
            // Basta o campo ter sido ABERTO uma vez antes da troca, mesmo sem
            // ter escolhido nada: aberto sem valor, ele se apega ao 1º item.
            key={modeloSel}
            value={origem || null}
            onValueChange={(v) => trocarOrigem(v ?? '')}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue placeholder="Produto ou kit" />
            </SelectTrigger>
            {/* Popup mais largo que o campo pra nomes longos de kit. */}
            <SelectContent className="w-auto max-w-[92vw] min-w-(--anchor-width)">
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
            // Mesmo caso do select acima, e verificado igual: trocar de
            // produto zera `tamanho` e troca a lista de tamanhos junto.
            key={origem}
            value={tamanho || null}
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

      {/* Kit: tamanho e cor escolhidos ITEM A ITEM. Os campos ficam na linha
          do próprio componente de propósito — empilhados no topo, dois
          dropdowns de tamanho não diriam a quem cada um pertence. */}
      {kit && (
        <div className="space-y-1.5">
          {kit.itens.map((it) => {
            const cores = coresDoProduto(it.produtoId)
            const tams = tamanhosDoProduto(it.produtoId)
            // Componente de tamanho único se resolve sozinho e sem cor não
            // há o que perguntar: linha sem campo nenhum não entra.
            if (cores.length === 0 && tams.length <= 1) return null
            return (
              <div key={it.id} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <span className="text-muted-foreground truncate text-xs">
                  {it.quantidade}× {it.produtoNome}
                </span>
                <div className="flex items-center gap-2">
                  {tams.length > 1 && (
                    <Select
                      value={tamanhosKit[it.produtoId] || null}
                      onValueChange={(v) =>
                        setTamanhosKit((prev) => ({
                          ...prev,
                          [it.produtoId]: v ?? '',
                        }))
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-28"
                        aria-label={`Tamanho de ${it.produtoNome}`}
                      >
                        <SelectValue placeholder="Tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        {tams.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {cores.length > 0 && (
                    <Select
                      value={coresKit[it.id] || null}
                      onValueChange={(v) => setCoresKit((prev) => ({ ...prev, [it.id]: v ?? '' }))}
                      disabled={disabled}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-40"
                        aria-label={`Cor de ${it.produtoNome}`}
                      >
                        <SelectValue placeholder="Cor" />
                      </SelectTrigger>
                      <SelectContent>
                        {cores.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
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
            O pedido #{orcamento && formatarNumeroPedido(orcamento.numero)} de {orcamento?.cliente}{' '}
            será removido.
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

// -----------------------------------------------------------------
// Badge de status — dropdown com todos os outros status
// -----------------------------------------------------------------

// Cinco estados, TODOS cromáticos, e a cor conta em que ponto o pedido está:
// âmbar parado, esmeralda aceito, azul-céu pronto pra sair, violeta encerrado
// bem, vermelho encerrado mal. Vermelho é o único alarme — e é o único que
// precisa saltar, porque é o único irreversível na cabeça de quem lê.
//
// Âmbar/esmeralda/azul são as mesmas de antes: quem já usa a tela não precisa
// reaprender nada. "Finalizado" era CINZA e virou violeta — o cinza lia como
// "desativado", quando o que ele diz é o oposto (deu certo e acabou). Violeta
// se separa bem do azul-céu do separado sem competir com o esmeralda.
//
// A pílula e o ponto do menu vivem NO MESMO objeto de propósito: eram dois
// mapas paralelos, e dois mapas paralelos saem de sincronia. Os nomes de
// classe ficam literais porque o Tailwind não enxerga classe montada por
// template string — `bg-${cor}-500` não gera CSS nenhum.
//
// O par claro/escuro é o mesmo do kanban de produção (`-700` no claro,
// `-300` no escuro sobre a tinta a 15%), que já está validado nos dois temas.
// O ponto é `bg-*` sólido de propósito: o item do dropdown reescreve a cor do
// TEXTO dos filhos no foco, então um rótulo colorido perderia a cor
// justamente quando o mouse está em cima.
const ESTILO_STATUS: Record<StatusPedido, { pilula: string; ponto: string }> = {
  aguardando: {
    pilula: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    ponto: 'bg-amber-500',
  },
  aprovado: {
    pilula: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    ponto: 'bg-emerald-500',
  },
  separado: {
    pilula: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    ponto: 'bg-sky-500',
  },
  finalizado: {
    pilula: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    ponto: 'bg-violet-500',
  },
  cancelado: {
    pilula: 'bg-red-500/15 text-red-700 dark:text-red-300',
    ponto: 'bg-red-500',
  },
}

const PILULA = 'rounded-full px-2 py-0.5 text-[11px] font-medium'

function StatusBadge({
  orcamento,
  podeEditar,
}: {
  orcamento: OrcamentoListItem
  podeEditar: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const atual = orcamento.status
  // Mesma função que a action usa pra validar — a tela nunca oferece um
  // destino que o servidor vai recusar.
  const opcoes = statusAlcancaveis(atual)
  // Cancelado desce pro fim, atrás de um divisor: não é "mais um passo", e
  // no meio da lista convida a clique errado.
  const etapas = opcoes.filter((s) => !ehExcecao(s))
  const excecoes = opcoes.filter((s) => ehExcecao(s))

  function mudarPara(destino: StatusPedido) {
    startTransition(async () => {
      const result = await mudarStatusOrcamentoAction(orcamento.id, destino)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Atualizado')
    })
  }

  function Item({ s }: { s: StatusPedido }) {
    return (
      <DropdownMenuItem onClick={() => mudarPara(s)}>
        <span className={cn('size-2 rounded-full', ESTILO_STATUS[s].ponto)} aria-hidden />
        {ROTULO_STATUS[s]}
      </DropdownMenuItem>
    )
  }

  if (!podeEditar || opcoes.length === 0) {
    return (
      <span className={cn(PILULA, 'inline-block', ESTILO_STATUS[atual].pilula)}>
        {ROTULO_STATUS[atual]}
      </span>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        title="Mudar status do pedido"
        className={cn(
          PILULA,
          'inline-flex items-center gap-0.5 transition-colors',
          ESTILO_STATUS[atual].pilula,
          isPending ? 'opacity-60' : 'hover:opacity-70',
        )}
      >
        {ROTULO_STATUS[atual]}
        <ChevronDown className="size-3 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto">
        {etapas.map((s) => (
          <Item key={s} s={s} />
        ))}
        {etapas.length > 0 && excecoes.length > 0 && <DropdownMenuSeparator />}
        {excecoes.map((s) => (
          <Item key={s} s={s} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
