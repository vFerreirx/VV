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
// ⚠️ CADA PEÇA LEVA A QUANTIDADE (Q200), e quem pode criar OP cria todas
// daqui (Q201): "Criar 6 OPs", uma por peça, numa transação só. O que
// acontece com cada peça — vira OP, vai pra fila, já está em produção — é
// `destinoDaMarcacao` (reposicao.ts), a MESMA regra que a action usa. Assim
// o número do botão é o número de OPs que nascem.
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
import { gestoDeToque } from '@/components/ui/foco-no-toque'
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
  destinoDaMarcacao,
  rotuloDoBotaoDeMarcar,
  situacaoDepoisDaMarcacao,
  viraOp,
  type DestinoDaMarcacao,
  type SituacaoDeReposicao,
} from '@/lib/producao/reposicao'
import { familiaDoProduto } from '@/lib/producao/rotulo-da-op'
import { cn } from '@/lib/utils'
import { marcarReposicaoSchema } from '@/lib/validators/reposicao'

type Produto = ProdutoComVariacoesParaForm
type Variacao = Produto['variacoes'][number]

const SEM_VALOR = '—'

export function MarcarPecasDialog({
  produtos,
  fila,
  criaOps,
  onClose,
}: {
  produtos: Produto[]
  /** O que já está na fila (aberto ou em produção), pra aparecer na grade. */
  fila: ItemDeReposicao[]
  /**
   * Quem marca também cria OP (escrita em Ordens — o gerente): as peças
   * viram OP ao salvar. Sem isso (a estoquista), vão pra fila com a
   * quantidade, e o "Produzir" da fila abre a Nova OP já preenchida.
   */
  criaOps: boolean
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
  // "Quantas produzir" de cada peça marcada, como o campo guarda (texto).
  const [quantidades, setQuantidades] = useState<Map<string, string>>(
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
    setQuantidades(new Map())
    setErro(null)
  }

  function tocar(variacaoId: string) {
    setErro(null)
    const item = naFila.get(variacaoId)
    // EM PRODUÇÃO OU PEDIDO AO PARCEIRO: nada a marcar — a célula já diz.
    if (item && item.estado !== 'aberto') return
    const jaMarcada = marcadas.get(variacaoId)
    const next = new Map(marcadas)
    // Tocar de novo com o mesmo modo desmarca; com o outro, troca. Vale
    // também pro item ABERTO que já estava na fila: marcá-lo é dar a
    // quantidade (e, pra quem cria OP, criar a OP dele). A situação só sobe
    // — `situacaoDepoisDaMarcacao`.
    if (jaMarcada === modo) next.delete(variacaoId)
    else next.set(variacaoId, modo)
    setMarcadas(next)
    if (jaMarcada !== undefined) return

    // Peça nova na lista: o item aberto traz a quantidade que já tinha.
    setQuantidades((prev) =>
      new Map(prev).set(
        variacaoId,
        item?.quantidade ? String(item.quantidade) : '',
      ),
    )
    // O TECLADO SÓ SOBE NO TOQUE NO CAMPO (#21): com o dedo, o campo fica
    // com a borda de "falta preencher"; com o mouse, já ganha o foco.
    if (!gestoDeToque()) {
      requestAnimationFrame(() =>
        document.getElementById(idDoCampo(variacaoId))?.focus(),
      )
    }
  }

  // O que acontece com cada peça marcada — a mesma regra da action.
  const destinos = new Map<string, DestinoDaMarcacao>(
    [...marcadas.keys()].map((id) => {
      const item = naFila.get(id)
      return [
        id,
        destinoDaMarcacao(
          item ? { estado: item.estado as 'aberto' } : null,
          produto?.origem ?? 'producao',
          criaOps,
        ),
      ]
    }),
  )
  const contagem = { ops: 0, parceiro: 0, itens: 0 }
  for (const d of destinos.values()) {
    if (viraOp(d)) contagem.ops++
    else if (produto?.origem === 'parceiro') contagem.parceiro++
    else contagem.itens++
  }

  function salvar() {
    if (!produto || marcadas.size === 0) return
    setErro(null)
    const entrada = {
      produtoId: produto.id,
      marcacoes: [...marcadas].map(([variacaoId, situacao]) => ({
        variacaoId,
        situacao,
        quantidade: quantidades.get(variacaoId) ?? '',
      })),
      observacao,
      criarOps: criaOps,
    }
    // A MESMA VALIDAÇÃO DO SERVIDOR, antes de ir: "diga quantas" aparece
    // aqui, sem ida e volta.
    const parsed = marcarReposicaoSchema.safeParse(entrada)
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? 'Dados inválidos')
      return
    }
    startTransition(async () => {
      const r = await marcarReposicaoAction(entrada)
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
              ? criaOps && produto.origem !== 'parceiro'
                ? 'Toque em cada peça que está acabando e diga quantas produzir. Cada uma vira uma OP.'
                : 'Toque em cada peça que está acabando e diga quantas faltam. Cada uma vira um item da fila.'
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

            {marcadas.size > 0 && (
              <QuantasProduzir
                produto={produto}
                marcadas={marcadas}
                destinos={destinos}
                naFila={naFila}
                quantidades={quantidades}
                onQuantidade={(id, v) =>
                  setQuantidades((prev) => new Map(prev).set(id, v))
                }
                disabled={isPending}
              />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reposicao-obs">Observação (opcional)</Label>
              <Textarea
                id="reposicao-obs"
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Vale pras peças marcadas agora. Fica na fila, não vai pra OP."
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
                {rotuloDoBotaoDeMarcar(contagem)}
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
                    // Em produção ou pedido ao parceiro: só mostra o estado.
                    const travada =
                      item !== undefined && item.estado !== 'aberto'
                    const mostra: SituacaoDeReposicao | null = marcada
                      ? situacaoDepoisDaMarcacao(item?.situacao ?? null, marcada)
                      : (item?.situacao ?? null)
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
                            marcada &&
                              mostra === 'acabou' &&
                              'border-destructive bg-destructive text-white',
                            marcada &&
                              mostra === 'acabando' &&
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
              ? `já em produção${i.opNumero ? ` (${i.opNumero})` : ''}`
              : i.estado === 'pedido_parceiro'
                ? 'já pedido ao parceiro'
                : ROTULO_DA_SITUACAO[i.situacao].toLowerCase()}
            {i.estado !== 'em_producao' &&
              i.quantidade !== null &&
              ` · faltam ${i.quantidade}`}
            {' — '}
            {i.marcadoPorNome ?? 'alguém'} em{' '}
            {new Date(i.marcadoEm).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            })}
            {i.estado === 'aberto' && ' · toque na célula pra marcar de novo'}
          </li>
        ))}
      </ul>
    </div>
  )
}

// O id do campo de quantidade de uma peça — o clique com mouse foca nele.
function idDoCampo(variacaoId: string) {
  return `reposicao-qtd-${variacaoId}`
}

// "QUANTAS PRODUZIR": uma linha por peça marcada, na ordem da grade. O campo
// é obrigatório (Q200) e numérico; o teclado só sobe quando a pessoa toca
// nele (#21) — até lá, a borda mostra o que falta.
function QuantasProduzir({
  produto,
  marcadas,
  destinos,
  naFila,
  quantidades,
  onQuantidade,
  disabled,
}: {
  produto: Produto
  marcadas: Map<string, SituacaoDeReposicao>
  destinos: Map<string, DestinoDaMarcacao>
  naFila: Map<string, ItemDeReposicao>
  quantidades: Map<string, string>
  onQuantidade: (variacaoId: string, valor: string) => void
  disabled: boolean
}) {
  const variosModelos = modelosDoProduto(produto).length > 1
  const linhas = produto.variacoes.filter((v) => marcadas.has(v.id))
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Quantas produzir</p>
      <ul className="divide-y rounded-lg border">
        {linhas.map((v) => {
          const situacao = situacaoDepoisDaMarcacao(
            naFila.get(v.id)?.situacao ?? null,
            marcadas.get(v.id)!,
          )
          const destino = destinos.get(v.id)!
          const valor = quantidades.get(v.id) ?? ''
          const nome = [variosModelos ? v.modelo : null, v.cor, v.tamanho]
            .filter(Boolean)
            .join(' · ')
          return (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2">
              <ColorSwatch hex={v.corHex} hex2={v.corHex2} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{nome}</p>
                <p className="text-muted-foreground text-xs">
                  <span
                    className={
                      situacao === 'acabou'
                        ? 'text-destructive'
                        : 'text-amber-700 dark:text-amber-400'
                    }
                  >
                    {ROTULO_DA_SITUACAO[situacao]}
                  </span>
                  {' · '}
                  {viraOp(destino)
                    ? `vira OP${situacao === 'acabou' ? ', prioridade alta' : ''}`
                    : produto.origem === 'parceiro'
                      ? 'pro parceiro, sem OP'
                      : 'vai pra fila'}
                </p>
              </div>
              <Input
                id={idDoCampo(v.id)}
                aria-label={`Quantas produzir: ${nome}`}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={valor}
                onChange={(e) => onQuantidade(v.id, e.target.value.replace(/\D/g, ''))}
                placeholder="Qtd."
                disabled={disabled}
                className={cn(
                  'w-20 text-right tabular-nums',
                  valor === '' && 'border-primary ring-3 ring-primary/30',
                )}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
