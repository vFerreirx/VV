'use client'

import { Boxes, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  atualizarKitAction,
  criarKitAction,
  excluirKitAction,
  type KitComItens,
  type KitItemDetalhe,
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
import {
  avisoPesoDeKit,
  formatarPesoDeKit,
  formatarPesoDeProduto,
  pesoDeKit,
  pesoDeProduto,
} from '@/lib/peso'

type Props = {
  kits: KitComItens[]
  produtos: ProdutoComVariacoesParaForm[]
  podeEditar: boolean
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
            Combos de venda (ex.: 1 peseira + 2 capas). O tamanho e a cor são
            escolhidos na hora de gerar as OPs, lá em Ordens.
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
          description="Crie um kit combinando produtos e a quantidade de cada um."
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
                      {it.quantidade}× {it.produtoNome}
                    </Badge>
                  ))}
                </div>

                <PesoDoKit itens={kit.itens} />
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
// Peso do kit
// -----------------------------------------------------------------

// O peso do kit é uma FAIXA sempre que algum componente existe em tamanhos
// que pesam diferente — a Peseira em Casal/King/Queen. O kit não guarda
// tamanho: isso só é escolhido ao gerar as OPs, então aqui não dá pra
// apontar um número só.
//
// E vira "—" inteiro quando falta peso em qualquer componente, a mesma regra
// que o pedido aplica: somar só o que está cadastrado devolveria um kit mais
// leve do que ele é, e é justamente esse número que iria pro frete. O aviso
// diz QUAL componente está segurando, senão o traço não ajuda a resolver.
function PesoDoKit({ itens }: { itens: KitItemDetalhe[] }) {
  const peso = pesoDeKit(itens)
  const aviso = avisoPesoDeKit(peso)

  return (
    <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t pt-2 text-xs">
      <span className="text-muted-foreground">Peso do kit</span>
      <span
        className="font-medium tabular-nums"
        title={detalhePorComponente(itens)}
      >
        {formatarPesoDeKit(peso)}
      </span>
      {aviso && (
        <span className="text-amber-600 dark:text-amber-500">{aviso}</span>
      )}
    </div>
  )
}

// Tooltip com a conta aberta: quanto pesa cada componente e quantos entram no
// kit. Sem isso, um "0,900–1,070 kg" não diz de onde saiu a faixa.
function detalhePorComponente(itens: KitItemDetalhe[]): string {
  return itens
    .map((it) => {
      const p = pesoDeProduto(it.pesoGramas, it.tamanhosPeso)
      const falta =
        p.semPeso.length > 0 ? ` (sem peso: ${p.semPeso.join(', ')})` : ''
      return `${it.quantidade}× ${it.produtoNome}: ${formatarPesoDeProduto(p)}${falta}`
    })
    .join('\n')
}

// -----------------------------------------------------------------
// Dialog: criar / editar kit (produto + quantidade por item)
// -----------------------------------------------------------------

type LinhaItem = { produtoId: string; quantidade: string }

const LINHA_VAZIA: LinhaItem = { produtoId: '', quantidade: '1' }

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
    kit?.itens.map((i) => ({
      produtoId: i.produtoId,
      quantidade: String(i.quantidade),
    })) ?? [{ ...LINHA_VAZIA }],
  )

  function patchItem(idx: number, patch: Partial<LinhaItem>) {
    setItens((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function addItem() {
    setItens((prev) => [...prev, { ...LINHA_VAZIA }])
  }
  function removeItem(idx: number) {
    setItens((prev) => prev.filter((_, i) => i !== idx))
  }

  function salvar() {
    const itensLimpos = itens
      .filter((l) => l.produtoId)
      .map((l) => ({
        produtoId: l.produtoId,
        quantidade: Math.max(1, Number(l.quantidade) || 1),
      }))
    if (itensLimpos.length === 0) {
      toast.error('Adicione ao menos um produto ao kit')
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
            Escolha os produtos e a quantidade de cada um por kit. Tamanho e
            cor são definidos só ao gerar as OPs.
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
            <Label>Produtos do kit</Label>
            {itens.map((linha, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select
                  value={linha.produtoId || null}
                  onValueChange={(v) => patchItem(idx, { produtoId: v ?? '' })}
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
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={addItem}
              disabled={isPending}
            >
              <Plus />
              Adicionar produto
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
