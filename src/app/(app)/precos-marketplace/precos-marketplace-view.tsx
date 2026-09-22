'use client'

import { ChevronDown, Package, ShoppingBag, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { salvarPrecoMarketplaceAction, type LinhaPreco } from './actions'
import { Badge } from '@/components/ui/badge'
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
  CANAIS_COM_PRECO,
  resumoDosCanais,
  type CanalComPreco,
} from '@/lib/preco-marketplace'
import { cn } from '@/lib/utils'
import { MARKETPLACE_LABEL } from '@/lib/validators/vendas'

// Tela de conferência de PREÇO DE ANÚNCIO. O aviso no topo não é enfeite: é
// o requisito. Ver src/lib/preco-marketplace.ts.

const TODOS = '__todos__'

// A linha está abaixo (ou igual) ao atacado em ALGUM canal? Um canal basta:
// o prejuízo não precisa dos cinco.
function abaixoDoAtacado(l: LinhaPreco): boolean {
  return CANAIS_COM_PRECO.some(
    (c) => l.estados[c] === 'abaixo' || l.estados[c] === 'igual',
  )
}

// "149,99" → 14999. A comparação de igualdade entre canais é feita em
// centavos inteiros — ver `resumoDosCanais`.
function centavosDoTexto(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function centavosPorCanal(l: LinhaPreco) {
  const saida: Partial<Record<CanalComPreco, number | null>> = {}
  for (const c of CANAIS_COM_PRECO) saida[c] = centavosDoTexto(l.precos[c])
  return saida
}

export function PrecosMarketplaceView({
  linhas,
  podeEditar,
}: {
  linhas: LinhaPreco[]
  podeEditar: boolean
}) {
  const [modeloSel, setModeloSel] = useState<string>(TODOS)
  const [canalSel, setCanalSel] = useState<string>(TODOS)
  const [soComPreco, setSoComPreco] = useState(true)
  const [soAbaixo, setSoAbaixo] = useState(false)
  const [mostrarVazios, setMostrarVazios] = useState(false)

  // CANAL SEM NENHUM PREÇO NÃO VIRA COLUNA. Hoje é a Temu: ela está no
  // catálogo de canais (e no CHECK do banco) porque um dia pode ter anúncio —
  // vendeu 2 peças em 2 dias o ano inteiro —, mas uma coluna que nunca tem
  // número é uma coluna que ensina a ignorar a grade. No dia em que ela tiver
  // preço, volta sozinha: isto é calculado do dado, não de uma lista fixa.
  const canaisVazios = useMemo(
    () =>
      CANAIS_COM_PRECO.filter(
        (c) => !linhas.some((l) => l.precos[c] !== undefined),
      ),
    [linhas],
  )

  const abaixo = useMemo(() => linhas.filter(abaixoDoAtacado), [linhas])

  const modelos = useMemo(() => [...new Set(linhas.map((l) => l.modelo))].sort(), [linhas])
  // useMemo e não expressão solta: `canais` é dependência do useMemo abaixo,
  // e um array novo a cada render refiltraria a grade inteira sem motivo.
  const canais = useMemo(
    (): readonly CanalComPreco[] =>
      canalSel !== TODOS
        ? [canalSel as CanalComPreco]
        : mostrarVazios
          ? CANAIS_COM_PRECO
          : CANAIS_COM_PRECO.filter((c) => !canaisVazios.includes(c)),
    [canalSel, mostrarVazios, canaisVazios],
  )

  const visiveis = useMemo(
    () =>
      linhas.filter((l) => {
        if (modeloSel !== TODOS && l.modelo !== modeloSel) return false
        // O catálogo tem muito mais combinação do que anúncio (o Kit
        // ACONCHEGO sozinho dá 12 combinações). Sem este filtro a grade nasce
        // com centenas de linhas vazias e o que existe some no meio.
        if (soComPreco && !canais.some((c) => l.precos[c] !== undefined)) return false
        if (soAbaixo && !abaixoDoAtacado(l)) return false
        return true
      }),
    [linhas, modeloSel, soComPreco, soAbaixo, canais],
  )

  const porModelo = useMemo(() => {
    const mapa = new Map<string, LinhaPreco[]>()
    for (const l of visiveis) mapa.set(l.modelo, [...(mapa.get(l.modelo) ?? []), l])
    return [...mapa.entries()]
  }, [visiveis])

  const comPreco = linhas.filter((l) =>
    CANAIS_COM_PRECO.some((c) => l.precos[c] !== undefined),
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Preços de marketplace</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Preço de <strong className="font-medium">anúncio</strong> por canal — o que está publicado
          no Mercado Livre, na Shopee e na Shein.
        </p>
      </div>

      {/* O requisito inegociável: em nenhum momento a tela pode dar a
          entender que este preço serve pro pedido. */}
      <div className="border-destructive/40 bg-destructive/5 flex items-start gap-3 rounded-xl border p-4">
        <TriangleAlert className="text-destructive mt-0.5 size-5 shrink-0" />
        <div className="text-sm">
          <p className="text-destructive font-medium">Estes preços NÃO são usados no pedido.</p>
          <p className="text-muted-foreground mt-1">
            O pedido puxa sempre o preço de{' '}
            <strong className="text-foreground font-medium">atacado</strong>, cadastrado em{' '}
            <Link href="/produtos" className="underline underline-offset-4">
              Produtos
            </Link>{' '}
            e{' '}
            <Link href="/kits" className="underline underline-offset-4">
              Kits
            </Link>
            . O preço de anúncio já embute comissão da plataforma, frete e imposto do varejo —
            cobrar isso de um lojista seria cobrar a mais.
          </p>
        </div>
      </div>

      {/* O SEGUNDO AVISO, e ele é sobre dinheiro que sai: anúncio abaixo do
          atacado faz o LOJISTA pagar mais caro que o consumidor final — e do
          anúncio ainda sai a comissão do canal. O número "quase certo" é o que
          passa despercebido: 54,99 parece um preço de anúncio normal. */}
      {abaixo.length > 0 && (
        <button
          type="button"
          onClick={() => setSoAbaixo((v) => !v)}
          className={cn(
            'flex w-full items-start gap-3 rounded-xl border p-4 text-left',
            soAbaixo
              ? 'border-amber-500/60 bg-amber-500/15'
              : 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10',
          )}
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-500" />
          <span className="text-sm">
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {abaixo.length === 1
                ? '1 par abaixo do preço de atacado'
                : `${abaixo.length} pares abaixo do preço de atacado`}
            </span>
            <span className="text-muted-foreground mt-1 block">
              O lojista paga mais caro que o consumidor, e do anúncio ainda sai
              a comissão do canal.{' '}
              {soAbaixo ? 'Clique pra ver tudo de novo.' : 'Clique pra ver só esses.'}
            </span>
          </span>
        </button>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pm-modelo">Modelo</Label>
          <Select value={modeloSel} onValueChange={(v) => v && setModeloSel(v)}>
            <SelectTrigger id="pm-modelo" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os modelos</SelectItem>
              {modelos.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pm-canal">Canal</Label>
          <Select value={canalSel} onValueChange={(v) => v && setCanalSel(v)}>
            <SelectTrigger id="pm-canal" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os canais</SelectItem>
              {CANAIS_COM_PRECO.map((c) => (
                <SelectItem key={c} value={c}>
                  {MARKETPLACE_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setSoComPreco((v) => !v)}
          className="text-muted-foreground hover:text-foreground h-9 text-sm underline-offset-4 hover:underline"
        >
          {soComPreco
            ? `Mostrar também sem preço (${linhas.length - comPreco} linhas)`
            : 'Mostrar só o que tem preço'}
        </button>
        {canaisVazios.length > 0 && canalSel === TODOS && (
          <button
            type="button"
            onClick={() => setMostrarVazios((v) => !v)}
            className="text-muted-foreground hover:text-foreground h-9 text-sm underline-offset-4 hover:underline"
          >
            {mostrarVazios
              ? 'Esconder canais vazios'
              : `Mostrar canais vazios (${canaisVazios
                  .map((c) => MARKETPLACE_LABEL[c])
                  .join(', ')})`}
          </button>
        )}
      </div>

      {porModelo.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nenhum preço de anúncio"
          description="Ajuste os filtros, ou mostre também as combinações sem preço para começar a cadastrar."
        />
      ) : (
        <div className="space-y-4">
          {porModelo.map(([modelo, itens]) => (
            <GrupoModelo
              key={modelo}
              modelo={modelo}
              linhas={itens}
              canais={canais}
              podeEditar={podeEditar}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function GrupoModelo({
  modelo,
  linhas,
  canais,
  podeEditar,
}: {
  modelo: string
  linhas: LinhaPreco[]
  canais: readonly CanalComPreco[]
  podeEditar: boolean
}) {
  const [aberto, setAberto] = useState(true)

  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="bg-muted/40 hover:bg-muted/70 flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors"
      >
        <ChevronDown className={cn('size-4 transition-transform', !aberto && '-rotate-90')} />
        <span className="font-medium">{modelo}</span>
        <span className="text-muted-foreground text-xs">
          {linhas.length} {linhas.length === 1 ? 'linha' : 'linhas'}
        </span>
      </button>

      {aberto && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2 text-left font-medium">
                  Item
                  {/* O atacado aparece na própria linha, ao lado do aviso —
                      e só pra quem tem a área de preço do catálogo. */}
                </th>
                {canais.map((c) => (
                  <th key={c} className="w-36 px-3 py-2 text-right font-medium whitespace-nowrap">
                    {MARKETPLACE_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((l) => {
                const alerta = abaixoDoAtacado(l)
                // TODOS OS CANAIS DIZEM O MESMO? A edição continua visível
                // nas cinco colunas (não escondo campo), mas quando há
                // divergência é ELA que ganha destaque — hoje a exceção se
                // esconde no meio de quatro repetições.
                const resumo = resumoDosCanais(centavosPorCanal(l))
                const cents = centavosPorCanal(l)
                return (
                <tr
                  key={l.id}
                  className={cn(
                    'hover:bg-muted/30',
                    alerta && 'bg-amber-500/5',
                  )}
                >
                  <td className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      {l.tipo === 'kit' ? (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          KIT
                        </Badge>
                      ) : (
                        <Package className="text-muted-foreground size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0">
                        {l.item}
                        <span className="text-muted-foreground"> · {l.variacao}</span>
                        {resumo.canaisComPreco > 1 && resumo.todosIguais && (
                          <span className="text-muted-foreground/70 ml-2 text-xs">
                            mesmo preço nos {resumo.canaisComPreco} canais
                          </span>
                        )}
                        {alerta && (
                          <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-400">
                            abaixo do atacado
                            {l.atacado ? ` (${l.atacado})` : ''}: o lojista paga
                            mais caro que o consumidor, e ainda sai a comissão
                            do canal
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  {canais.map((c) => {
                    const estado = l.estados[c]
                    // Diverge do resto? Só faz sentido destacar quando há mais
                    // de um canal com preço.
                    const diverge =
                      !resumo.todosIguais &&
                      resumo.canaisComPreco > 1 &&
                      cents[c] != null
                    return (
                    <td
                      key={c}
                      className={cn(
                        'px-3 py-1.5',
                        (estado === 'abaixo' || estado === 'igual') &&
                          'bg-amber-500/10',
                        diverge && 'font-semibold',
                      )}
                    >
                      {/* `key` inclui o valor do servidor: quando ele muda
                          (outra aba, ou o refresh depois de salvar), a célula
                          remonta com o valor novo em vez de segurar o estado
                          antigo do input. */}
                      <CelulaPreco
                        key={`${l.id}|${c}|${l.precos[c] ?? ''}`}
                        linha={l}
                        canal={c}
                        podeEditar={podeEditar}
                      />
                    </td>
                    )
                  })}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Célula editável no lugar. Só grava no blur e só quando o texto mudou —
// sem isso, passar o Tab pela grade dispararia uma escrita por coluna.
function CelulaPreco({
  linha,
  canal,
  podeEditar,
}: {
  linha: LinhaPreco
  canal: CanalComPreco
  podeEditar: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const original = linha.precos[canal] ?? ''
  const [valor, setValor] = useState(original)

  if (!podeEditar) {
    return (
      <div className="text-right tabular-nums">
        {original === '' ? <span className="text-muted-foreground">—</span> : original}
      </div>
    )
  }

  function salvar() {
    if (valor.trim() === original) return
    startTransition(async () => {
      const r = await salvarPrecoMarketplaceAction({
        tipo: linha.tipo,
        donoId: linha.donoId,
        tamanho: linha.tamanho,
        combinacao: linha.combinacao,
        canal,
        valor,
      })
      if (!r.success) {
        toast.error(r.error)
        setValor(original)
        return
      }
      toast.success(r.message ?? 'Salvo')
      router.refresh()
    })
  }

  return (
    <Input
      inputMode="decimal"
      aria-label={`${MARKETPLACE_LABEL[canal]} — ${linha.item} ${linha.variacao}`}
      placeholder="—"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setValor(original)
      }}
      disabled={isPending}
      className="h-8 text-right tabular-nums"
    />
  )
}
