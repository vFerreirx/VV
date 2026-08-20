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
import { CANAIS_COM_PRECO, type CanalComPreco } from '@/lib/preco-marketplace'
import { cn } from '@/lib/utils'
import { MARKETPLACE_LABEL } from '@/lib/validators/vendas'

// Tela de conferência de PREÇO DE ANÚNCIO. O aviso no topo não é enfeite: é
// o requisito. Ver src/lib/preco-marketplace.ts.

const TODOS = '__todos__'

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

  const modelos = useMemo(() => [...new Set(linhas.map((l) => l.modelo))].sort(), [linhas])
  // useMemo e não expressão solta: `canais` é dependência do useMemo abaixo,
  // e um array novo a cada render refiltraria a grade inteira sem motivo.
  const canais = useMemo(
    (): readonly CanalComPreco[] =>
      canalSel === TODOS ? CANAIS_COM_PRECO : [canalSel as CanalComPreco],
    [canalSel],
  )

  const visiveis = useMemo(
    () =>
      linhas.filter((l) => {
        if (modeloSel !== TODOS && l.modelo !== modeloSel) return false
        // O catálogo tem muito mais combinação do que anúncio (o Kit
        // ACONCHEGO sozinho dá 12 combinações). Sem este filtro a grade nasce
        // com centenas de linhas vazias e o que existe some no meio.
        if (soComPreco && !canais.some((c) => l.precos[c] !== undefined)) return false
        return true
      }),
    [linhas, modeloSel, soComPreco, canais],
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
                <th className="px-4 py-2 text-left font-medium">Item</th>
                {canais.map((c) => (
                  <th key={c} className="w-36 px-3 py-2 text-right font-medium whitespace-nowrap">
                    {MARKETPLACE_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30">
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
                      </span>
                    </div>
                  </td>
                  {canais.map((c) => (
                    <td key={c} className="px-3 py-1.5">
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
                  ))}
                </tr>
              ))}
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
