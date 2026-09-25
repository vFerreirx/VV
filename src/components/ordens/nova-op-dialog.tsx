'use client'

// "NOVA OP" — o único jeito de criar OP avulsa, no kanban e na /ordens.
//
// Eram dois caminhos com regras diferentes: a página /ordens/novo, que
// conferia o catálogo, e a "Nova OP rápida" do kanban, que aceitava OP sem
// variação, não conferia o catálogo e oferecia variação apagada. No dia da
// virada o gerente cadastra no sistema todas as OPs abertas do Trello — e o
// caminho mais rápido era justamente o que gravava OP que o operador não sabe
// tecer. Agora é um diálogo só, via `criarOrdemAction`.
//
// ⚠️ CRIAR E CONTINUAR. Depois de salvar o diálogo NÃO fecha: mostra quantas
// OPs já saíram, mantém o que costuma se repetir entre uma OP e a próxima
// (produto e modelo, canal, prioridade, prazo, situação) e limpa o que é da
// peça (tamanho, cor, quantidade) e as observações — instrução levada pra OP
// errada é pior que redigitar. Fecha pelo X ou Esc.
//
// ⚠️ VINDO DO FALTANTE DE UM PEDIDO, idem, com canal Venda direta travado e
// a quantidade que falta já preenchida (editável), sem prazo.
//
// ⚠️ VINDO DA FILA DE REPOSIÇÃO (/estoque), É OUTRO GESTO: a peça e o canal
// Estoque já vêm escolhidos e TRAVADOS, a quantidade fica em branco (é decisão
// do gerente) e o diálogo FECHA ao criar — um item da fila vira uma OP, e a
// action liga as duas na mesma transação.

import { ChevronDown, Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  criarOrdemAction,
  type ProdutoComVariacoesParaForm,
} from '@/app/(app)/ordens/actions'
import {
  opcoesDeRemessaParaNovaOp,
  type OpcoesDeRemessaDaNovaOp,
} from '@/app/(app)/ordens/remessas-actions'
import type { RemessaDaNovaOp } from '@/lib/db/remessa-da-op'
import {
  diaMes,
  ehCanalFull,
  producaoAtePadrao,
} from '@/lib/producao/prazo-da-remessa'
import { CatalogoOrdem } from '@/components/forms/catalogo-ordem'
import { Button } from '@/components/ui/button'
import { ColorSwatch } from '@/components/ui/color-swatch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from '@/components/ui/textarea'
import {
  buscarVariacoes,
  SEM_MODELO,
  type EscopoDaBusca,
} from '@/lib/producao/catalogo-op'
import { tituloDaOp } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'
import {
  CANAL_LABEL,
  PRIORIDADE_LABEL,
  STATUS_INICIAIS,
  STATUS_LABEL,
  canalValues,
  criarOrdemSchema,
  prioridadeValues,
} from '@/lib/validators/ordens'

type Produto = ProdutoComVariacoesParaForm
type Variacao = Produto['variacoes'][number]
type Escolha = { produto: Produto; variacao: Variacao }

type Canal = (typeof canalValues)[number]
type Prioridade = (typeof prioridadeValues)[number]
type StatusInicial = (typeof STATUS_INICIAIS)[number]

export function NovaOpDialog({
  produtos,
  onClose,
  reposicao,
  pedido,
}: {
  /** Sempre `listarProdutosParaOrdem({ somenteAtivas: true })`. */
  produtos: Produto[]
  onClose: () => void
  /** O item da fila de reposição que esta OP vai atender. */
  reposicao?: { id: string; variacaoId: string }
  /** O faltante de pedido que esta OP produz. */
  pedido?: {
    orcamentoId: string
    numero: string
    chave: string
    variacaoId: string
    quantidade: number
  }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const buscaRef = useRef<HTMLInputElement>(null)

  // A peça
  const [escopo, setEscopo] = useState<EscopoDaBusca | null>(null)
  const [termo, setTermo] = useState('')
  const [destaque, setDestaque] = useState(0)
  // Reposição e faltante de pedido: a peça já vem escolhida, e travada.
  const pecaFixa = reposicao?.variacaoId ?? pedido?.variacaoId ?? null
  const [escolha, setEscolha] = useState<Escolha | null>(() => {
    if (!pecaFixa) return null
    for (const produto of produtos) {
      const variacao = produto.variacoes.find((v) => v.id === pecaFixa)
      if (variacao) return { produto, variacao }
    }
    return null
  })
  const [navegando, setNavegando] = useState(false)
  // ⚠️ O CATÁLOGO É CONTROLADO: ele sabe qual produto está escolhido pelas
  // props, não por estado próprio. Passar `produtoId=""` fixo fazia o clique
  // no produto não carregar nada — o catálogo avisava a escolha, ninguém
  // guardava, e ele continuava sem produto pra mostrar tamanho e cor.
  const [noCatalogo, setNoCatalogo] = useState({ produtoId: '', variacaoId: '' })
  const [quantidade, setQuantidade] = useState(
    pedido ? String(pedido.quantidade) : '',
  )

  // O planejamento — o que se repete de uma OP pra próxima
  const [canal, setCanal] = useState<Canal>(pedido ? 'venda_direta' : 'estoque')
  const [prioridade, setPrioridade] = useState<Prioridade>('normal')
  const [maisDetalhes, setMaisDetalhes] = useState(false)
  const [prazo, setPrazo] = useState('')
  const [situacao, setSituacao] = useState<StatusInicial>('programado')
  const [observacoes, setObservacoes] = useState('')

  // FULL SÓ DENTRO DE UMA REMESSA — escolhida entre as que ainda não saíram,
  // ou criada aqui com conta e data de envio. As opções são buscadas quando o
  // canal vira Full (não pesam no diálogo de quem cria OP de estoque).
  // `remessaEscolhida`: '' (falta escolher), o id de uma remessa, ou 'nova'.
  const [opcoesFull, setOpcoesFull] = useState<OpcoesDeRemessaDaNovaOp | null>(null)
  const [remessaEscolhida, setRemessaEscolhida] = useState('')
  const [contaId, setContaId] = useState('')
  const [dataEnvio, setDataEnvio] = useState('')
  const ehFull = ehCanalFull(canal)

  const [criadas, setCriadas] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  function carregarOpcoesFull(doCanal: Canal, selecionar = '') {
    setOpcoesFull(null)
    opcoesDeRemessaParaNovaOp(doCanal)
      .then((o) => {
        setOpcoesFull(o)
        setRemessaEscolhida(selecionar)
      })
      .catch(() => setErro('Não deu pra carregar as remessas. Tente de novo.'))
  }

  // O PRAZO QUE A OP VAI HERDAR, mostrado antes de salvar: o prazo da
  // PRODUÇÃO da remessa (a data do caminhão menos a folga, ou o escolhido),
  // pela mesma conta que o servidor faz.
  const prazoDoFull =
    remessaEscolhida === 'nova'
      ? dataEnvio
        ? producaoAtePadrao(dataEnvio)
        : null
      : (opcoesFull?.remessas.find((r) => r.id === remessaEscolhida)
          ?.producaoAte ?? null)

  const busca = useMemo(
    () => buscarVariacoes(produtos, termo, { escopo }),
    [produtos, termo, escopo],
  )
  const produtoDoEscopo = escopo
    ? produtos.find((p) => p.id === escopo.produtoId)
    : undefined

  function escolher(e: Escolha) {
    setEscolha(e)
    setErro(null)
    setTermo('')
    setDestaque(0)
  }

  function trocarPeca() {
    setEscolha(null)
    setErro(null)
    requestAnimationFrame(() => buscaRef.current?.focus())
  }

  function trocarCanal(novo: Canal) {
    setCanal(novo)
    // VENDA DIRETA TEM CLIENTE ESPERANDO: o prazo deixa de ser detalhe. Abre
    // no toque, e não num efeito — é consequência do gesto, não do estado.
    if (novo === 'venda_direta') setMaisDetalhes(true)
    // Trocou pra Full (ou de um Full pro outro): a remessa é do canal, então
    // a escolha anterior não vale mais.
    setRemessaEscolhida('')
    setContaId('')
    if (ehCanalFull(novo)) carregarOpcoesFull(novo)
  }

  // ⚠️ ENTER NA BUSCA ESCOLHE A VARIAÇÃO DESTACADA, e não salva. Sem essa
  // separação, Enter aqui salvaria uma OP com a peça da OP anterior. Nos
  // outros campos, Enter salva (é o `onSubmit` do form).
  function teclaNaBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setDestaque((i) => Math.min(i + 1, Math.max(busca.itens.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setDestaque((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = busca.itens[destaque]
      if (item) escolher(item)
    } else if (e.key === 'Backspace' && termo === '' && escopo) {
      // Apagar com a caixa vazia tira o escopo — o mesmo gesto de apagar um
      // filtro em qualquer busca.
      setEscopo(null)
    }
  }

  function salvar() {
    setErro(null)
    if (!escolha) {
      setErro('Escolha a peça: busque pela variação.')
      buscaRef.current?.focus()
      return
    }
    const entrada = {
      produtoId: escolha.produto.id,
      variacaoId: escolha.variacao.id,
      quantidade,
      maquinaId: '',
      responsavelId: '',
      canalDestino: canal,
      prioridade,
      status: situacao,
      // "Início previsto" saiu da criação: nada no sistema usa o campo além
      // de gravar e exibir. Continua na edição.
      dataPrevistaInicio: '',
      dataPrevistaFim: prazo,
      observacoes,
    }
    // A MESMA VALIDAÇÃO DO SERVIDOR, antes de ir: a frase aparece aqui, ao
    // lado do campo, em vez de voltar da action.
    const parsed = criarOrdemSchema.safeParse(entrada)
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? 'Dados inválidos')
      return
    }

    // A remessa do Full. A action recusa sem ela; a frase vem antes daqui.
    let remessa: RemessaDaNovaOp | undefined
    if (ehFull) {
      if (!remessaEscolhida) {
        setErro('OP de Full vai dentro de uma remessa: escolha uma ou crie uma nova.')
        return
      }
      if (remessaEscolhida === 'nova') {
        if (!contaId) return setErro('Escolha a conta da remessa.')
        if (!dataEnvio) return setErro('Informe a data de envio da remessa.')
        remessa = { nova: { contaId, dataEnvio } }
      } else {
        remessa = { remessaId: remessaEscolhida }
      }
    }

    startTransition(async () => {
      const r = await criarOrdemAction(
        entrada,
        reposicao
          ? { reposicaoId: reposicao.id }
          : pedido
            ? { pedido: { orcamentoId: pedido.orcamentoId, chave: pedido.chave } }
            : { remessa },
      )
      if (!r.success) {
        setErro(r.error)
        return
      }
      // A REMESSA CRIADA AGORA vira a escolhida pra próxima OP. Sem isto,
      // cada "Salvar" do criar-e-continuar criaria outra remessa igual.
      if (remessaEscolhida === 'nova' && r.data?.remessaFullId) {
        carregarOpcoesFull(canal, r.data.remessaFullId)
      }
      if (reposicao || pedido) {
        toast.success(
          reposicao
            ? 'OP criada — a peça está em produção'
            : 'OP criada e ligada ao pedido',
        )
        router.refresh()
        onClose()
        return
      }
      const agora = criadas + 1
      setCriadas(agora)
      toast.success(r.message ?? 'OP criada')

      // MANTÉM produto e modelo (como escopo da próxima busca), canal,
      // prioridade, prazo e situação. LIMPA a peça, a quantidade e as
      // observações.
      setEscopo({
        produtoId: escolha.produto.id,
        modelo: escolha.variacao.modelo || SEM_MODELO,
      })
      setEscolha(null)
      setTermo('')
      setDestaque(0)
      setQuantidade('')
      setObservacoes('')
      router.refresh()
      requestAnimationFrame(() => buscaRef.current?.focus())
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {reposicao
              ? 'Produzir pra repor'
              : pedido
                ? `Produzir pro pedido #${pedido.numero}`
                : 'Nova OP'}
          </DialogTitle>
          <DialogDescription>
            {reposicao ? (
              'OP de canal Estoque pra peça que está acabando. Informe a quantidade.'
            ) : pedido ? (
              'OP de venda direta pra peça que faltou na separação. Confira a quantidade.'
            ) : criadas > 0 ? (
              <span className="text-foreground font-medium">
                {criadas} {criadas === 1 ? 'OP criada' : 'OPs criadas'}
              </span>
            ) : (
              'Busque a variação, informe a quantidade e salve. O diálogo continua aberto pra próxima.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            salvar()
          }}
        >
          {/* ─── A PEÇA ─────────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="nova-op-busca">
                Variação <span className="text-destructive">*</span>
              </Label>
              {!pecaFixa && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                  onClick={() => setNavegando((v) => !v)}
                  disabled={isPending}
                >
                  {navegando ? 'Buscar variação' : 'Navegar pelo catálogo'}
                </button>
              )}
            </div>

            {escolha ? (
              <div className="bg-muted/40 flex items-center gap-3 rounded-lg border p-2.5">
                <ColorSwatch
                  hex={escolha.variacao.corHex}
                  hex2={escolha.variacao.corHex2}
                />
                <TituloDaVariacao produto={escolha.produto} variacao={escolha.variacao} />
                {/* Na reposição a peça é a do item da fila: trocar criaria
                    uma OP que não repõe o que foi pedido. */}
                {!pecaFixa && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto shrink-0"
                    onClick={trocarPeca}
                    disabled={isPending}
                  >
                    Trocar
                  </Button>
                )}
              </div>
            ) : navegando ? (
              // O PERCURSO PASSO A PASSO continua, pra quem não sabe o nome do
              // que procura. Escolher aqui preenche a mesma peça da busca.
              <CatalogoOrdem
                produtos={produtos}
                produtoId={noCatalogo.produtoId}
                variacaoId={noCatalogo.variacaoId}
                disabled={isPending}
                onChange={(produtoId, variacaoId) => {
                  const produto = produtos.find((p) => p.id === produtoId)
                  const variacao = produto?.variacoes.find((v) => v.id === variacaoId)
                  if (produto && variacao) {
                    // Chegou na variação: vira a peça escolhida, e o catálogo
                    // recomeça do zero na próxima vez que for aberto.
                    escolher({ produto, variacao })
                    setNavegando(false)
                    setNoCatalogo({ produtoId: '', variacaoId: '' })
                    return
                  }
                  // Ainda no meio do caminho (modelo ou produto escolhido, falta
                  // tamanho ou cor): guarda, pra o catálogo mostrar o próximo
                  // passo.
                  setNoCatalogo({ produtoId, variacaoId })
                }}
              />
            ) : (
              <>
                {/* O ESCOPO da OP anterior, removível. Com a caixa vazia a
                    lista já mostra as variações dele, e o gerente só digita a
                    cor e o tamanho da próxima. Apagar com a caixa vazia, ou o
                    ✕, volta pro catálogo inteiro. */}
                {escopo && produtoDoEscopo && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Buscando em</span>
                    <span className="bg-secondary inline-flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5">
                      <span className="truncate">
                        {produtoDoEscopo.nome}
                        {escopo.modelo !== SEM_MODELO && ` · ${escopo.modelo}`}
                      </span>
                      <button
                        type="button"
                        aria-label="Buscar no catálogo inteiro"
                        className="hover:text-foreground"
                        onClick={() => {
                          setEscopo(null)
                          buscaRef.current?.focus()
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  </div>
                )}
                <div className="relative">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                  <Input
                    id="nova-op-busca"
                    ref={buscaRef}
                    autoFocus
                    autoComplete="off"
                    value={termo}
                    onChange={(e) => {
                      setTermo(e.target.value)
                      setDestaque(0)
                    }}
                    onKeyDown={teclaNaBusca}
                    placeholder={
                      escopo
                        ? 'Cor ou tamanho da próxima'
                        : 'Produto, modelo, cor, tamanho ou SKU'
                    }
                    className="pl-8"
                    disabled={isPending}
                  />
                </div>

                {busca.itens.length > 0 && (
                  <ul
                    role="listbox"
                    aria-label="Variações encontradas"
                    className="max-h-64 divide-y overflow-y-auto rounded-lg border"
                  >
                    {busca.itens.map((item, i) => (
                      <li key={item.variacao.id} role="option" aria-selected={i === destaque}>
                        <button
                          type="button"
                          onMouseEnter={() => setDestaque(i)}
                          onClick={() => escolher(item)}
                          className={cn(
                            'flex w-full items-center gap-3 px-2.5 py-2 text-left',
                            i === destaque ? 'bg-accent' : 'hover:bg-accent/50',
                          )}
                        >
                          <ColorSwatch
                            hex={item.variacao.corHex}
                            hex2={item.variacao.corHex2}
                          />
                          <TituloDaVariacao produto={item.produto} variacao={item.variacao} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {busca.total > busca.itens.length && (
                  <p className="text-muted-foreground text-xs">
                    Mostrando {busca.itens.length} de {busca.total}. Digite mais
                    pra refinar.
                  </p>
                )}
                {busca.total === 0 && (termo.trim() !== '' || escopo) && (
                  <p className="text-muted-foreground text-sm">
                    Nenhuma variação encontrada.
                  </p>
                )}
              </>
            )}
          </div>

          {/* ─── À VISTA ────────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="nova-op-qtd">
                Quantidade <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nova-op-qtd"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="peças"
                // Na reposição a peça já vem escolhida: o que falta é isto.
                autoFocus={pecaFixa !== null}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nova-op-canal">Canal</Label>
              <Select
                items={CANAL_LABEL}
                value={canal}
                onValueChange={(v) => v && trocarCanal(v as Canal)}
                // Repor estoque é canal Estoque (só nele a finalização dá entrada);
                // faltante de pedido é Venda direta. Os dois vêm travados.
                disabled={isPending || reposicao !== undefined || pedido !== undefined}
              >
                <SelectTrigger id="nova-op-canal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canalValues.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CANAL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nova-op-prioridade">Prioridade</Label>
              <Select
                items={PRIORIDADE_LABEL}
                value={prioridade}
                onValueChange={(v) => v && setPrioridade(v as Prioridade)}
                disabled={isPending}
              >
                <SelectTrigger id="nova-op-prioridade" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {prioridadeValues.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDADE_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── A REMESSA DO FULL ───────────────────────────────────── */}
          {/* OP de Full só existe DENTRO de uma remessa: sem ela a OP nascia
              sem conta e sem data de envio. Escolhe uma das que ainda não
              saíram (a mesma lista do "Mudar destino"), ou cria na hora. */}
          {ehFull && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label htmlFor="nova-op-remessa">
                  Remessa <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={remessaEscolhida || null}
                  onValueChange={(v) => setRemessaEscolhida(v ?? '')}
                  disabled={isPending || opcoesFull === null}
                >
                  <SelectTrigger id="nova-op-remessa" className="w-full">
                    <SelectValue
                      placeholder={
                        opcoesFull === null ? 'Carregando…' : 'Escolha a remessa'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {opcoesFull?.remessas.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.rotulo}
                      </SelectItem>
                    ))}
                    <SelectItem value="nova">+ Nova remessa…</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {remessaEscolhida === 'nova' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="nova-op-conta">
                      Conta <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={contaId || null}
                      onValueChange={(v) => setContaId(v ?? '')}
                      disabled={isPending}
                    >
                      <SelectTrigger id="nova-op-conta" className="w-full">
                        <SelectValue placeholder="Escolha a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {opcoesFull?.contas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {opcoesFull?.contas.length === 0 && (
                      <p className="text-muted-foreground text-xs">
                        Nenhuma conta ativa desse canal. Cadastre em Contas de
                        marketplace.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nova-op-envio">
                      Data de envio <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="nova-op-envio"
                      type="date"
                      value={dataEnvio}
                      onChange={(e) => setDataEnvio(e.target.value)}
                      disabled={isPending}
                    />
                  </div>
                </div>
              )}

              {prazoDoFull && (
                <p className="text-muted-foreground text-xs">
                  Prazo da produção: {diaMes(prazoDoFull)} — vem da remessa.
                </p>
              )}
            </div>
          )}

          {/* ─── MAIS DETALHES ──────────────────────────────────────── */}
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setMaisDetalhes((v) => !v)}
              aria-expanded={maisDetalhes}
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-sm"
            >
              <span>
                Mais detalhes
                {!maisDetalhes && (prazo || situacao !== 'programado' || observacoes) && (
                  <span className="text-foreground"> · preenchido</span>
                )}
              </span>
              <ChevronDown
                className={cn('size-4 transition-transform', maisDetalhes && 'rotate-180')}
              />
            </button>
            {maisDetalhes && (
              <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nova-op-prazo">Prazo</Label>
                  <Input
                    id="nova-op-prazo"
                    type="date"
                    value={prazo}
                    onChange={(e) => setPrazo(e.target.value)}
                    // No Full o prazo VEM DA REMESSA (o servidor sobrescreve):
                    // digitar aqui seria digitar à toa.
                    disabled={isPending || ehFull}
                  />
                  {ehFull && (
                    <p className="text-muted-foreground text-xs">
                      No Full, o prazo vem da remessa.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nova-op-situacao">Situação inicial</Label>
                  <Select
                    items={STATUS_LABEL}
                    value={situacao}
                    onValueChange={(v) => v && setSituacao(v as StatusInicial)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="nova-op-situacao" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_INICIAIS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="nova-op-obs">Observações</Label>
                  <Textarea
                    id="nova-op-obs"
                    rows={2}
                    placeholder="O operador lê isto ao iniciar e no cartão da máquina"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
            )}
          </div>

          {erro && (
            <p role="alert" className="text-destructive text-sm">
              {erro}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" loading={isPending} disabled={isPending}>
              Salvar OP
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// O MESMO TÍTULO DO CARTÃO E DO TABLET (`tituloDaOp`): família em negrito,
// cor e tamanho em peso normal. O gerente escolhe aqui a peça que o operador
// vai conferir lá, e as duas telas não podem descrever a mesma variação de
// jeitos diferentes.
function TituloDaVariacao({ produto, variacao }: Escolha) {
  const t = tituloDaOp(produto.nome, {
    cor: variacao.cor,
    modelo: variacao.modelo,
    tamanho: variacao.tamanho,
  })
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm">
        <span className="font-medium">{t.familia}</span>
        {t.variacao && <span className="text-muted-foreground"> · {t.variacao}</span>}
      </span>
      <span className="text-muted-foreground block truncate text-xs tabular-nums">
        {t.modelo && `${t.modelo} · `}
        {variacao.skuVariacao}
      </span>
    </span>
  )
}

// O botão que abre o diálogo e cuida do próprio estado — pra lugares que só
// precisam do "criar OP" sem mais nada em volta (o vazio da lista de Ordens).
export function BotaoNovaOp({
  produtos,
  children,
  size,
}: {
  produtos: Produto[]
  children: React.ReactNode
  size?: React.ComponentProps<typeof Button>['size']
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button size={size} onClick={() => setAberto(true)}>
        {children}
      </Button>
      {aberto && (
        <NovaOpDialog produtos={produtos} onClose={() => setAberto(false)} />
      )}
    </>
  )
}
