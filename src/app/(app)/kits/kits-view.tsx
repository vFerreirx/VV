'use client'

import { Boxes, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarKitAction,
  criarKitAction,
  excluirKitAction,
  type KitComItens,
} from './actions'
import type { ProdutoComVariacoesParaForm } from '../ordens/actions'
import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  kits: KitComItens[]
  produtos: ProdutoComVariacoesParaForm[]
  podeEditar: boolean
}

// Token interno pra representar tamanho/cor nulos num <Select> (que não
// aceita value vazio/nulo). '' = ainda não escolhido.
const SEM = '__sem__'
const tok = (s: string | null) => s ?? SEM
const rotuloTok = (v: string) => (v === SEM ? '—' : v)

function descVariacao(v: {
  cor: string | null
  tamanho: string | null
  modelo: string | null
}): string {
  return [v.tamanho, v.cor, v.modelo].filter(Boolean).join(' ') || 'padrão'
}

// Valores distintos preservando a ordem de aparição.
function distintos<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

export function KitsView({ kits, produtos, podeEditar }: Props) {
  const [editando, setEditando] = useState<KitComItens | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<KitComItens | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kits</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Combos de venda (ex.: 1 peseira + 2 capas). Na produção, o kit é
            gerado como OPs unitárias por componente.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setEditando('novo')}>
            <Plus />
            Novo kit
          </Button>
        )}
      </div>

      {kits.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum kit cadastrado"
          description="Crie um kit combinando variações de produto e suas quantidades."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {kits.map((kit) => {
            const pecas = kit.itens.reduce((s, i) => s + i.quantidade, 0)
            return (
              <article
                key={kit.id}
                className="vv-lift flex flex-col gap-3 rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{kit.nome}</span>
                      {!kit.ativo && (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground font-mono text-xs">
                      {kit.sku} · {pecas} peças/kit
                    </div>
                  </div>
                  {podeEditar && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditando(kit)}
                        aria-label="Editar"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setExcluindo(kit)}
                        aria-label="Excluir"
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {kit.itens.map((it) => (
                    <Badge key={it.id} variant="secondary" className="font-normal">
                      {it.quantidade}× {it.produtoNome}{' '}
                      <span className="text-muted-foreground ml-1">
                        {descVariacao(it)}
                      </span>
                    </Badge>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {editando && (
        <KitDialog
          kit={editando === 'novo' ? null : editando}
          produtos={produtos}
          onClose={() => setEditando(null)}
        />
      )}
      <ExcluirDialog kit={excluindo} onClose={() => setExcluindo(null)} />
    </div>
  )
}

// -----------------------------------------------------------------
// Dialog: criar / editar kit
// -----------------------------------------------------------------

// Cada linha guarda produto + tamanho + cor (tokens) e resolve a variação
// específica ao salvar.
type LinhaItem = {
  produtoId: string
  tamanho: string
  cor: string
  quantidade: string
}

const LINHA_VAZIA: LinhaItem = {
  produtoId: '',
  tamanho: '',
  cor: '',
  quantidade: '1',
}

function KitDialog({
  kit,
  produtos,
  onClose,
}: {
  kit: KitComItens | null
  produtos: ProdutoComVariacoesParaForm[]
  onClose: () => void
}) {
  const isEdit = kit !== null
  const [isPending, startTransition] = useTransition()
  const [nome, setNome] = useState(kit?.nome ?? '')
  const [sku, setSku] = useState(kit?.sku ?? '')
  const [descricao, setDescricao] = useState(kit?.descricao ?? '')
  const [ativo, setAtivo] = useState(kit?.ativo ?? true)
  const [itens, setItens] = useState<LinhaItem[]>(
    kit?.itens.map((i) => {
      const prod = produtos.find((p) =>
        p.variacoes.some((v) => v.id === i.variacaoId),
      )
      return {
        produtoId: prod?.id ?? '',
        tamanho: tok(i.tamanho),
        cor: tok(i.cor),
        quantidade: String(i.quantidade),
      }
    }) ?? [{ ...LINHA_VAZIA }],
  )

  function patchItem(idx: number, patch: Partial<LinhaItem>) {
    setItens((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    )
  }
  function addItem() {
    setItens((prev) => [...prev, { ...LINHA_VAZIA }])
  }
  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  // Produto + tamanho + cor -> id da variação específica.
  function resolverVariacao(l: LinhaItem): string | null {
    const prod = produtos.find((p) => p.id === l.produtoId)
    if (!prod) return null
    const v = prod.variacoes.find(
      (x) => tok(x.tamanho) === l.tamanho && tok(x.cor) === l.cor,
    )
    return v?.id ?? null
  }

  function salvar() {
    const itensLimpos: { variacaoId: string; quantidade: number }[] = []
    for (const l of itens) {
      const variacaoId = resolverVariacao(l)
      if (!variacaoId) continue
      itensLimpos.push({
        variacaoId,
        quantidade: Math.max(1, Number(l.quantidade) || 1),
      })
    }
    if (itensLimpos.length === 0) {
      toast.error('Selecione produto, tamanho e cor de cada item')
      return
    }

    startTransition(async () => {
      const payload = {
        nome,
        sku,
        descricao: descricao || undefined,
        ativo,
        itens: itensLimpos,
      }
      const result = isEdit
        ? await atualizarKitAction(kit.id, payload)
        : await criarKitAction(payload)
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
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-6">
          <DialogTitle>{isEdit ? 'Editar kit' : 'Novo kit'}</DialogTitle>
          <DialogDescription>
            Escolha o produto, o tamanho e a cor de cada item, e a quantidade
            por kit.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
          <div className="grid grid-cols-[1fr_10rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kit-nome">Nome</Label>
              <Input
                id="kit-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                disabled={isPending}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kit-sku">SKU</Label>
              <Input
                id="kit-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                disabled={isPending}
                placeholder="KIT-001"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Itens do kit</Label>
            {itens.map((linha, idx) => {
              const prod = produtos.find((p) => p.id === linha.produtoId)
              const tamanhos = prod
                ? distintos(prod.variacoes.map((v) => tok(v.tamanho)))
                : []
              const cores = prod
                ? distintos(
                    prod.variacoes
                      .filter((v) => tok(v.tamanho) === linha.tamanho)
                      .map((v) => tok(v.cor)),
                  )
                : []
              return (
                <div key={idx} className="space-y-2 rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <Select
                      value={linha.produtoId || undefined}
                      onValueChange={(v) =>
                        patchItem(idx, {
                          produtoId: v ?? '',
                          tamanho: '',
                          cor: '',
                        })
                      }
                      disabled={isPending}
                    >
                      <SelectTrigger size="sm" className="flex-1">
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
                    <Input
                      inputMode="numeric"
                      aria-label="Quantidade por kit"
                      value={linha.quantidade}
                      onChange={(e) =>
                        patchItem(idx, {
                          quantidade: e.target.value.replace(/\D/g, ''),
                        })
                      }
                      disabled={isPending}
                      className="h-9 w-14 text-center"
                    />
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
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={linha.tamanho || undefined}
                      onValueChange={(v) =>
                        patchItem(idx, { tamanho: v ?? '', cor: '' })
                      }
                      disabled={isPending || !prod}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Tamanho" />
                      </SelectTrigger>
                      <SelectContent>
                        {tamanhos.map((t) => (
                          <SelectItem key={t} value={t}>
                            {rotuloTok(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={linha.cor || undefined}
                      onValueChange={(v) => patchItem(idx, { cor: v ?? '' })}
                      disabled={isPending || !linha.tamanho}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Cor" />
                      </SelectTrigger>
                      <SelectContent>
                        {cores.map((c) => (
                          <SelectItem key={c} value={c}>
                            {rotuloTok(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={addItem}
              disabled={isPending}
            >
              <Plus />
              Adicionar item
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kit-desc">Observação (opcional)</Label>
            <Textarea
              id="kit-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="kit-ativo" className="text-sm">
              Ativo
            </Label>
            <Switch
              id="kit-ativo"
              checked={ativo}
              onCheckedChange={setAtivo}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter className="border-t p-6">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={isPending}>
            {isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// -----------------------------------------------------------------
// Dialog: excluir
// -----------------------------------------------------------------

function ExcluirDialog({
  kit,
  onClose,
}: {
  kit: KitComItens | null
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!kit) return
    startTransition(async () => {
      const result = await excluirKitAction(kit.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluído')
      onClose()
    })
  }

  return (
    <Dialog open={kit !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir kit?</DialogTitle>
          <DialogDescription>
            {kit?.nome} será removido. OPs já geradas não são afetadas.
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
