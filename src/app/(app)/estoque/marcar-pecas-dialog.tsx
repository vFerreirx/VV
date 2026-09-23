'use client'

// MARCAR PEÇAS ACABANDO — busca o produto, e toca célula por célula na grade.
//
// ⚠️ SEM ATALHO PRA LINHA OU COLUNA INTEIRA. Um "marcar todas as cores do
// Queen" seria rápido e errado: a fila vira OP, e cada célula marcada sem
// querer é uma OP de uma peça que não estava acabando. A marcação é precisa
// porque cada toque é uma variação escolhida de propósito.
//
// A BUSCA É A MESMA DA NOVA OP (`buscarVariacoes`, sem acento e sem
// maiúscula, todo pedaço casando em qualquer campo). Aqui o resultado é
// agrupado por PRODUTO: quem marca olha a prateleira de uma peça e vê o que
// falta nela, não uma variação solta.
//
// COM A CAIXA VAZIA, O CATÁLOGO: os produtos agrupados por FAMÍLIA (Peseira,
// Manta, Capa de Almofada) e, dentro dela, um botão por modelo. É o caminho
// de quem está de frente pra prateleira e não sabe o nome exato — sem
// digitar nada.

import { ArrowLeft, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { marcarReposicaoAction, type ItemDeReposicao } from './actions'
import type { ProdutoComVariacoesParaForm } from '@/app/(app)/ordens/actions'
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
import { Textarea } from '@/components/ui/textarea'
import {
  SEM_MODELO,
  buscarVariacoes,
  modelosDoProduto,
  variacoesDoModelo,
} from '@/lib/producao/catalogo-op'
import {
  ROTULO_DA_SITUACAO,
  podeSubirSituacao,
  type SituacaoDeReposicao,
} from '@/lib/producao/reposicao'
import { familiaDoProduto } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'

type Produto = ProdutoComVariacoesParaForm
type Variacao = Produto['variacoes'][number]

const SEM_VALOR = '—'

export function MarcarPecasDialog({
  produtos,
  fila,
  onClose,
}: {
  produtos: Produto[]
  /** O que já está na fila (aberto ou em produção), pra aparecer na grade. */
  fila: ItemDeReposicao[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [termo, setTermo] = useState('')
  const [produtoId, setProdutoId] = useState<string | null>(null)
  // O que o próximo toque marca. Trocar o modo não mexe no que já foi tocado.
  const [modo, setModo] = useState<SituacaoDeReposicao>('acabando')
  const [marcadas, setMarcadas] = useState<Map<string, SituacaoDeReposicao>>(
    () => new Map(),
  )
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const naFila = useMemo(
    () => new Map(fila.map((i) => [i.variacaoId, i])),
    [fila],
  )

  // Produtos que casam com a busca, na ordem do catálogo.
  const encontrados = useMemo(() => {
    const { itens } = buscarVariacoes(produtos, termo, { limite: 10_000 })
    const vistos = new Map<string, { produto: Produto; variacoes: number }>()
    for (const { produto } of itens) {
      const atual = vistos.get(produto.id)
      if (atual) atual.variacoes++
      else vistos.set(produto.id, { produto, variacoes: 1 })
    }
    return [...vistos.values()]
  }, [produtos, termo])

  const produto = produtoId
    ? (produtos.find((p) => p.id === produtoId) ?? null)
    : null

  function trocarProduto() {
    setProdutoId(null)
    setMarcadas(new Map())
    setErro(null)
  }

  function tocar(variacaoId: string) {
    setErro(null)
    setMarcadas((prev) => {
      const next = new Map(prev)
      const item = naFila.get(variacaoId)
      // JÁ NA FILA: só dá pra subir de "Acabando" pra "Acabou". O toque liga e
      // desliga essa subida; nada mais.
      if (item) {
        if (!podeSubirSituacao(item.situacao, 'acabou')) return prev
        if (next.has(variacaoId)) next.delete(variacaoId)
        else next.set(variacaoId, 'acabou')
        return next
      }
      // Tocar de novo com o mesmo modo desmarca; com o outro, troca.
      if (next.get(variacaoId) === modo) next.delete(variacaoId)
      else next.set(variacaoId, modo)
      return next
    })
  }

  function salvar() {
    if (!produto || marcadas.size === 0) return
    setErro(null)
    startTransition(async () => {
      const r = await marcarReposicaoAction({
        produtoId: produto.id,
        marcacoes: [...marcadas].map(([variacaoId, situacao]) => ({
          variacaoId,
          situacao,
        })),
        observacao,
      })
      if (!r.success) {
        setErro(r.error)
        return
      }
      toast.success(r.message ?? 'Peças marcadas')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Marcar peças acabando</DialogTitle>
          <DialogDescription>
            {produto
              ? 'Toque em cada peça que está acabando. Cada uma vira um item da fila.'
              : 'Escolha no catálogo, ou busque pelo nome, cor, tamanho ou SKU.'}
          </DialogDescription>
        </DialogHeader>

        {!produto ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                autoFocus
                autoComplete="off"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Ex.: peseira aconchego"
                className="pl-8"
              />
            </div>
            {termo.trim() === '' ? (
              <Catalogo produtos={produtos} onEscolher={setProdutoId} />
            ) : encontrados.length > 0 ? (
              <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                {encontrados.map(({ produto: p }) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setProdutoId(p.id)}
                      className="hover:bg-accent/50 flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="truncate text-sm font-medium">{p.nome}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {p.variacoes.length}{' '}
                        {p.variacoes.length === 1 ? 'variação' : 'variações'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nenhum produto encontrado.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Trocar produto"
                  onClick={trocarProduto}
                  disabled={isPending}
                >
                  <ArrowLeft />
                </Button>
                <span className="truncate font-medium">{produto.nome}</span>
              </div>
              {/* O MODO DO TOQUE: escolhe uma vez e toca várias células. */}
              <div className="bg-muted inline-flex rounded-lg p-0.5 text-sm">
                {(['acabando', 'acabou'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setModo(s)}
                    aria-pressed={modo === s}
                    className={cn(
                      'rounded-md px-3 py-1.5 transition-colors',
                      modo === s
                        ? s === 'acabou'
                          ? 'bg-destructive text-white shadow-sm'
                          : 'bg-amber-500 text-white shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Marcar como {ROTULO_DA_SITUACAO[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[50vh] space-y-4 overflow-y-auto">
              {modelosDoProduto(produto).map((modelo) => (
                <Grade
                  key={modelo}
                  modelo={modelosDoProduto(produto).length > 1 ? modelo : null}
                  variacoes={variacoesDoModelo(produto.variacoes, modelo) as Variacao[]}
                  naFila={naFila}
                  marcadas={marcadas}
                  onTocar={tocar}
                  disabled={isPending}
                />
              ))}
              <JaNaFila produto={produto} naFila={naFila} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reposicao-obs">Observação (opcional)</Label>
              <Textarea
                id="reposicao-obs"
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Vale pras peças marcadas agora"
                disabled={isPending}
              />
            </div>

            {erro && <p className="text-destructive text-sm">{erro}</p>}

            <div className="flex justify-end">
              <Button
                loading={isPending}
                onClick={salvar}
                disabled={isPending || marcadas.size === 0}
              >
                {marcadas.size === 0
                  ? 'Toque nas peças'
                  : marcadas.size === 1
                    ? 'Marcar 1 peça'
                    : `Marcar ${marcadas.size} peças`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// O CATÁLOGO POR FAMÍLIA. A família sai de `familiaDoProduto` (o mesmo corte
// do tablet e da fila); quando o nome não termina com o modelo cadastrado —
// "Manta - 3D" com modelo EFEITO 3D —, o corte é pelo " - " do nome, pra
// peça não virar uma família sozinha.
function familiaEModelo(produto: Produto): { familia: string; modelo: string } {
  const modelo = produto.variacoes.find((v) => v.modelo)?.modelo ?? null
  const familia = familiaDoProduto(produto.nome, modelo)
  if (familia !== produto.nome) {
    return { familia, modelo: modelo ?? produto.nome }
  }
  const i = produto.nome.lastIndexOf(' - ')
  if (i > 0) {
    return {
      familia: produto.nome.slice(0, i).trim(),
      modelo: produto.nome.slice(i + 3).trim(),
    }
  }
  return { familia: produto.nome, modelo: produto.nome }
}

function Catalogo({
  produtos,
  onEscolher,
}: {
  produtos: Produto[]
  onEscolher: (produtoId: string) => void
}) {
  const grupos = new Map<string, { produto: Produto; modelo: string }[]>()
  for (const p of produtos) {
    // Produto sem variação não tem o que marcar.
    if (p.variacoes.length === 0) continue
    const { familia, modelo } = familiaEModelo(p)
    const lista = grupos.get(familia) ?? []
    lista.push({ produto: p, modelo })
    grupos.set(familia, lista)
  }
  const familias = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  if (familias.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum produto com variação cadastrada.
      </p>
    )
  }

  return (
    <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
      {familias.map((familia) => (
        <div key={familia} className="space-y-1.5">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {familia}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {grupos
              .get(familia)!
              .sort((a, b) => a.modelo.localeCompare(b.modelo, 'pt-BR'))
              .map(({ produto, modelo }) => (
                <button
                  key={produto.id}
                  type="button"
                  onClick={() => onEscolher(produto.id)}
                  title={produto.nome}
                  className="hover:bg-accent min-h-10 rounded-full border px-3.5 py-1.5 text-sm transition-colors"
                >
                  {modelo}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// CORES NAS LINHAS, TAMANHOS NAS COLUNAS. Célula sem variação cadastrada fica
// vazia e não tocável — a combinação não existe no catálogo.
function Grade({
  modelo,
  variacoes,
  naFila,
  marcadas,
  onTocar,
  disabled,
}: {
  modelo: string | null
  variacoes: Variacao[]
  naFila: Map<string, ItemDeReposicao>
  marcadas: Map<string, SituacaoDeReposicao>
  onTocar: (variacaoId: string) => void
  disabled: boolean
}) {
  const tamanhos = [...new Set(variacoes.map((v) => v.tamanho ?? SEM_VALOR))]
  const cores = [...new Set(variacoes.map((v) => v.cor ?? SEM_VALOR))]
  const celula = new Map(
    variacoes.map((v) => [`${v.cor ?? SEM_VALOR}|${v.tamanho ?? SEM_VALOR}`, v]),
  )

  return (
    <div className="space-y-1.5">
      {modelo && modelo !== SEM_MODELO && (
        <p className="text-muted-foreground text-xs font-medium uppercase">
          {modelo}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th />
              {tamanhos.map((t) => (
                <th
                  key={t}
                  className="text-muted-foreground px-1 text-center text-xs font-medium"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cores.map((cor) => {
              const amostra = variacoes.find((v) => (v.cor ?? SEM_VALOR) === cor)
              return (
                <tr key={cor}>
                  <th className="pr-2 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <ColorSwatch
                        hex={amostra?.corHex ?? null}
                        hex2={amostra?.corHex2 ?? null}
                      />
                      <span className="truncate">{cor}</span>
                    </span>
                  </th>
                  {tamanhos.map((t) => {
                    const v = celula.get(`${cor}|${t}`)
                    if (!v) {
                      return <td key={t} className="bg-muted/30 rounded-md" />
                    }
                    const item = naFila.get(v.id)
                    const marcada = marcadas.get(v.id)
                    // Na fila e sem como subir: só mostra o estado.
                    const travada =
                      item !== undefined &&
                      !podeSubirSituacao(item.situacao, 'acabou')
                    const mostra: SituacaoDeReposicao | null =
                      marcada ?? item?.situacao ?? null
                    return (
                      <td key={t} className="p-0">
                        <button
                          type="button"
                          onClick={() => onTocar(v.id)}
                          disabled={disabled || travada}
                          aria-pressed={marcada !== undefined}
                          title={
                            item
                              ? `Na fila: ${ROTULO_DA_SITUACAO[item.situacao]}, marcado por ${item.marcadoPorNome ?? 'alguém'}`
                              : undefined
                          }
                          className={cn(
                            'h-11 w-full min-w-16 rounded-md border px-1 text-xs transition-colors',
                            marcada === 'acabou' &&
                              'border-destructive bg-destructive text-white',
                            marcada === 'acabando' &&
                              'border-amber-500 bg-amber-500 text-white',
                            !marcada &&
                              item &&
                              'border-dashed bg-muted text-muted-foreground',
                            !marcada && !item && 'hover:bg-accent',
                          )}
                        >
                          {item && !marcada
                            ? item.estado === 'em_producao'
                              ? 'Em produção'
                              : item.estado === 'pedido_parceiro'
                                ? 'Pedido'
                                : ROTULO_DA_SITUACAO[item.situacao]
                            : mostra
                              ? ROTULO_DA_SITUACAO[mostra]
                              : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// QUEM MARCOU E QUANDO, pras peças deste produto que já estão na fila. É o
// que responde "alguém já avisou?" antes de tocar de novo.
function JaNaFila({
  produto,
  naFila,
}: {
  produto: Produto
  naFila: Map<string, ItemDeReposicao>
}) {
  const itens = produto.variacoes
    .map((v) => naFila.get(v.id))
    .filter((i): i is ItemDeReposicao => i !== undefined)
  if (itens.length === 0) return null
  return (
    <div className="space-y-1 rounded-lg border p-3 text-sm">
      <p className="font-medium">Já na fila</p>
      <ul className="text-muted-foreground space-y-0.5">
        {itens.map((i) => (
          <li key={i.id}>
            {[i.variacaoCor, i.variacaoTamanho].filter(Boolean).join(' · ')}:{' '}
            {i.estado === 'em_producao'
              ? `em produção${i.opNumero ? ` (${i.opNumero})` : ''}`
              : i.estado === 'pedido_parceiro'
                ? 'pedido ao parceiro'
                : ROTULO_DA_SITUACAO[i.situacao].toLowerCase()}
            {' — '}
            {i.marcadoPorNome ?? 'alguém'} em{' '}
            {new Date(i.marcadoEm).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            })}
            {i.situacao === 'acabando' &&
              i.estado === 'aberto' &&
              ' · toque na célula pra passar pra "Acabou"'}
          </li>
        ))}
      </ul>
    </div>
  )
}
