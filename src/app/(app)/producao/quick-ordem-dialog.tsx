'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  criarOrdemRapidaAction,
  type ProdutoComVariacoesParaForm,
} from '@/app/(app)/ordens/actions'
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
import {
  CANAL_LABEL,
  PRIORIDADE_LABEL,
  canalValues,
  prioridadeValues,
} from '@/lib/validators/ordens'

export function QuickOrdemDialog({
  open,
  onClose,
  produtos,
}: {
  open: boolean
  onClose: () => void
  produtos: ProdutoComVariacoesParaForm[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [produtoId, setProdutoId] = useState('')
  const [variacaoId, setVariacaoId] = useState('nenhuma')
  const [quantidade, setQuantidade] = useState('')
  const [canal, setCanal] =
    useState<(typeof canalValues)[number]>('estoque')
  const [prioridade, setPrioridade] =
    useState<(typeof prioridadeValues)[number]>('normal')

  const produtoSel = useMemo(
    () => produtos.find((p) => p.id === produtoId),
    [produtos, produtoId],
  )
  const variacoes = useMemo(
    () => produtoSel?.variacoes ?? [],
    [produtoSel],
  )

  const produtosItems = useMemo(
    () => produtos.map((p) => ({ value: p.id, label: `${p.sku} — ${p.nome}` })),
    [produtos],
  )
  const variacoesItems = useMemo(
    () => [
      { value: 'nenhuma', label: 'Sem variação' },
      ...variacoes.map((v) => ({
        value: v.id,
        label:
          [v.cor, v.modelo, v.tamanho].filter(Boolean).join(' / ') ||
          v.skuVariacao,
      })),
    ],
    [variacoes],
  )

  function fechar() {
    setProdutoId('')
    setVariacaoId('nenhuma')
    setQuantidade('')
    setCanal('estoque')
    setPrioridade('normal')
    onClose()
  }

  function salvar() {
    startTransition(async () => {
      const result = await criarOrdemRapidaAction({
        produtoId,
        variacaoId: variacaoId === 'nenhuma' ? undefined : variacaoId,
        quantidade,
        canalDestino: canal,
        prioridade,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'OP criada')
      router.refresh()
      fechar()
    })
  }

  const valido = produtoId !== '' && Number(quantidade) > 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova OP rápida</DialogTitle>
          <DialogDescription>
            Pra botar algo pra rodar na hora (ex: sobrou fio). Entra no kanban
            na coluna &ldquo;Programado&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qo-prod">Produto</Label>
            <Select
              items={produtosItems}
              value={produtoId || ''}
              onValueChange={(v) => {
                setProdutoId(v ?? '')
                setVariacaoId('nenhuma')
              }}
              disabled={isPending}
            >
              <SelectTrigger id="qo-prod" className="w-full">
                <SelectValue placeholder="Selecione um produto…" />
              </SelectTrigger>
              <SelectContent>
                {produtos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {`${p.sku} — ${p.nome}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qo-var">Variação</Label>
            <Select
              items={variacoesItems}
              value={variacaoId}
              onValueChange={(v) => v && setVariacaoId(v)}
              disabled={isPending || !produtoSel || variacoes.length === 0}
            >
              <SelectTrigger id="qo-var" className="w-full">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">Sem variação</SelectItem>
                {variacoes.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {[v.cor, v.modelo, v.tamanho].filter(Boolean).join(' / ') ||
                      v.skuVariacao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qo-qtd">Qtd (peças)</Label>
              <Input
                id="qo-qtd"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="0"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qo-canal">Canal</Label>
              <Select
                items={CANAL_LABEL}
                value={canal}
                onValueChange={(v) =>
                  v && setCanal(v as (typeof canalValues)[number])
                }
                disabled={isPending}
              >
                <SelectTrigger id="qo-canal" className="w-full">
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
              <Label htmlFor="qo-prio">Prioridade</Label>
              <Select
                items={PRIORIDADE_LABEL}
                value={prioridade}
                onValueChange={(v) =>
                  v && setPrioridade(v as (typeof prioridadeValues)[number])
                }
                disabled={isPending}
              >
                <SelectTrigger id="qo-prio" className="w-full">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={isPending || !valido}>
            {isPending ? 'Criando…' : 'Criar OP'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
