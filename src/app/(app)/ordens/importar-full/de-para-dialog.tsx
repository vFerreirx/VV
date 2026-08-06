'use client'

import { Plus, X } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import type { ComponenteResolvido, ItemConferencia } from '../full-import-actions'
import { listarItensDoKit, salvarDeParaAction } from '../full-import-actions'
import type { KitComItens } from '../../kits/actions'
import type { ProdutoParaSelecao } from './importar-full-view'
import { Button } from '@/components/ui/button'
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

// Uma linha do mapeamento: qual produto, qual variação (cor/tamanho) e
// quantas peças por unidade do envio.
type Linha = {
  produtoId: string
  variacaoId: string
  quantidade: string
}

const SEM_KIT = '__sem_kit__'

function nomeVariacao(v: {
  cor: string | null
  tamanho: string | null
  modelo: string | null
}): string {
  return [v.modelo, v.cor, v.tamanho].filter(Boolean).join(' · ') || '—'
}

type Props = {
  canal: 'full_ml' | 'full_shopee'
  kits: KitComItens[]
  produtos: ProdutoParaSelecao[]
  onSalvo: (codigo: string, componentes: ComponenteResolvido[], kitId: string | null) => void
  onFechar: () => void
}

// Casca do diálogo. O formulário é REMONTADO a cada código (key) em vez de
// zerar o estado num efeito — nasce já com o mapeamento salvo carregado.
export function DeParaDialog({ item, ...props }: Props & { item: ItemConferencia | null }) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && props.onFechar()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {item && <Formulario key={item.codigo} item={item} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

// Todas as variações num índice só, pra achar o produto de uma variação
// salva ao reabrir o mapeamento.
function indexarVariacoes(produtos: ProdutoParaSelecao[]) {
  return produtos.flatMap((p) => p.variacoes.map((v) => ({ ...v, produtoId: p.id })))
}

function Formulario({
  item,
  canal,
  kits,
  produtos,
  onSalvo,
  onFechar,
}: Props & { item: ItemConferencia }) {
  const variacoes = useMemo(() => indexarVariacoes(produtos), [produtos])

  const [kitId, setKitId] = useState<string>(item.kitIdSugerido ?? SEM_KIT)
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    // Já tinha mapeamento: reaproveita o que estava salvo.
    item.componentes.map((c) => ({
      produtoId: variacoes.find((x) => x.id === c.variacaoId)?.produtoId ?? '',
      variacaoId: c.variacaoId,
      quantidade: String(c.quantidade),
    })),
  )
  const [isPending, startTransition] = useTransition()
  const [carregandoKit, setCarregandoKit] = useState(false)

  // Escolher um kit monta as linhas prontas com o PRODUTO e a QUANTIDADE
  // certos — que é o que o kit sabe de verdade. A cor fica em branco de
  // propósito.
  //
  // Já teve aqui uma sugestão de cor lida do SKU do envio, e ela foi
  // REMOVIDA: o SKU de um kit carrega as cores de todas as peças
  // ("094-K-MANTA-BLACK-2CA-45-AREIA-BLACK") e não diz de quem é cada uma.
  // Nesse caso o "BLACK" da manta nem existe no catálogo (lá é "Preto"),
  // sobrava só "AREIA" casando — que é a cor da CAPA — e a manta vinha
  // sugerida como Areia: confiante e errada, e foi parar no banco. Sem uma
  // gramática do SKU não dá pra acertar isso, e chutar cor manda a fábrica
  // tricotar a peça errada.
  function aoEscolherKit(novo: string) {
    setKitId(novo)
    if (novo === SEM_KIT) return
    setCarregandoKit(true)
    startTransition(async () => {
      const itens = await listarItensDoKit(novo)
      setLinhas(
        itens.map((it) => ({
          produtoId: it.produtoId,
          variacaoId: '',
          quantidade: String(it.quantidade),
        })),
      )
      setCarregandoKit(false)
    })
  }

  function patch(idx: number, p: Partial<Linha>) {
    setLinhas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...p } : l)))
  }

  function salvar() {
    const componentes = linhas
      .filter((l) => l.variacaoId)
      .map((l) => ({
        variacaoId: l.variacaoId,
        quantidade: Math.max(1, Number(l.quantidade) || 1),
      }))
    if (componentes.length !== linhas.length || componentes.length === 0) {
      toast.error('Escolha a variação (cor/tamanho) de todas as linhas')
      return
    }

    startTransition(async () => {
      const r = await salvarDeParaAction({
        canal,
        codigo: item.codigo,
        kitId: kitId === SEM_KIT ? null : kitId,
        skuVisto: item.sku || null,
        descricaoVista: item.descricao || null,
        componentes,
      })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success(r.message ?? 'Mapeamento salvo')
      onSalvo(item.codigo, r.data ?? [], kitId === SEM_KIT ? null : kitId)
    })
  }

  return (
    <>
      <DialogHeader className="border-b p-6">
        <DialogTitle>O que produzir para este código?</DialogTitle>
        <DialogDescription>
          Diga as peças que a fábrica produz por unidade deste código — fica salvo pros próximos
          envios.
        </DialogDescription>
        <div className="space-y-1 pt-2 text-sm">
          <div>
            <span className="text-muted-foreground">Código: </span>
            <span className="font-mono font-medium">{item?.codigo}</span>
          </div>
          {item?.sku && (
            <div>
              <span className="text-muted-foreground">SKU do envio: </span>
              <span className="font-mono">{item.sku}</span>
            </div>
          )}
          {item?.descricao && <div className="text-muted-foreground">{item.descricao}</div>}
          {item?.variacao && (
            <div>
              <span className="text-muted-foreground">Variação: </span>
              {item.variacao}
            </div>
          )}
        </div>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
        {item?.alterado && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <div className="font-medium">O item deste código mudou desde o último mapeamento.</div>
            <div className="mt-1 space-y-0.5">
              {item.skuAnterior && item.skuAnterior !== item.sku && (
                <div>
                  SKU antes: <span className="font-mono">{item.skuAnterior}</span>
                </div>
              )}
              {item.descricaoAnterior && item.descricaoAnterior !== item.descricao && (
                <div>Descrição antes: {item.descricaoAnterior}</div>
              )}
            </div>
            <div className="mt-1">
              Confira se os componentes ainda estão certos antes de salvar.
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Começar por um kit cadastrado</Label>
          <Select
            // `null` (e não undefined) mantém o Select CONTROLADO desde a
            // primeira renderização — com undefined o Base UI o trata como
            // uncontrolled e ignora o valor vindo do de-para salvo.
            value={kitId || null}
            onValueChange={(v) => aoEscolherKit(v ?? SEM_KIT)}
            disabled={isPending}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_KIT}>Montar peça por peça…</SelectItem>
              {kits.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            O kit já traz os produtos e a quantidade certa — sobra escolher a cor de cada um.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Peças por unidade do envio</Label>

          {carregandoKit && <p className="text-muted-foreground text-sm">Carregando kit…</p>}

          {linhas.length === 0 && !carregandoKit && (
            <p className="text-muted-foreground text-sm">
              Escolha um kit acima ou adicione as peças uma a uma.
            </p>
          )}

          {linhas.map((l, idx) => {
            const prod = produtos.find((p) => p.id === l.produtoId)
            return (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                <Select
                  value={l.produtoId || null}
                  onValueChange={(v) => patch(idx, { produtoId: v ?? '', variacaoId: '' })}
                  disabled={isPending}
                >
                  <SelectTrigger size="sm" className="min-w-52 flex-1">
                    <SelectValue placeholder="Produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={l.variacaoId || null}
                  onValueChange={(v) => patch(idx, { variacaoId: v ?? '' })}
                  disabled={isPending || !prod}
                >
                  <SelectTrigger size="sm" className="min-w-52 flex-1">
                    <SelectValue placeholder="Cor / tamanho" />
                  </SelectTrigger>
                  <SelectContent>
                    {(prod?.variacoes ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {nomeVariacao(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  inputMode="numeric"
                  aria-label="Peças por unidade"
                  value={l.quantidade}
                  onChange={(e) => patch(idx, { quantidade: e.target.value.replace(/\D/g, '') })}
                  disabled={isPending}
                  className="h-9 w-16 text-center"
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setLinhas((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={isPending}
                  aria-label="Remover peça"
                >
                  <X />
                </Button>
              </div>
            )
          })}

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setLinhas((prev) => [...prev, { produtoId: '', variacaoId: '', quantidade: '1' }])
            }
            disabled={isPending}
          >
            <Plus />
            Adicionar peça
          </Button>
        </div>
      </div>

      <DialogFooter className="flex-row items-center justify-between border-t p-6 sm:justify-between">
        <span className="text-muted-foreground text-xs">
          Fica salvo: o próximo envio com este código já vem resolvido.
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onFechar} disabled={isPending}>
            Cancelar
          </Button>
          <Button loading={isPending} onClick={salvar} disabled={isPending}>
            {'Salvar mapeamento'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
