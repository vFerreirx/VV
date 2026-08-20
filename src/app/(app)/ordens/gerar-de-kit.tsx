'use client'

import { Combine } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { listarProdutosParaOrdem } from './actions'
import { gerarOpsKitAction, type KitComItens } from '../kits/actions'
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
  CANAL_LABEL_CURTO,
  PRIORIDADE_LABEL,
  canalValues,
  prioridadeValues,
} from '@/lib/validators/ordens'

type Produtos = Awaited<ReturnType<typeof listarProdutosParaOrdem>>

// Token interno pra tamanho/cor nulos no <Select>. '' = não escolhido.
const SEM = '__sem__'
const tok = (s: string | null) => s ?? SEM
const rotuloTok = (v: string) => (v === SEM ? '—' : v)
const distintos = <T,>(arr: T[]): T[] => [...new Set(arr)]

type Escolha = { tamanho: string; cor: string }

export function GerarDeKit({ kits, produtos }: { kits: KitComItens[]; produtos: Produtos }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [kitId, setKitId] = useState(kits[0]?.id ?? '')
  const [qtd, setQtd] = useState('1')
  const [canal, setCanal] = useState<(typeof canalValues)[number]>('estoque')
  const [prioridade, setPrioridade] = useState<(typeof prioridadeValues)[number]>('normal')
  // Escolha de tamanho/cor por item do kit (kitItemId -> tokens).
  const [sel, setSel] = useState<Record<string, Escolha>>({})

  const kit = kits.find((k) => k.id === kitId) ?? null
  const n = Math.max(1, Number(qtd) || 1)

  function trocarKit(id: string) {
    setKitId(id)
    setSel({})
  }
  function patchSel(itemId: string, patch: Partial<Escolha>) {
    setSel((prev) => {
      const atual = prev[itemId] ?? { tamanho: '', cor: '' }
      return { ...prev, [itemId]: { ...atual, ...patch } }
    })
  }

  function variacaoDe(produtoId: string, e?: Escolha): string | null {
    if (!e?.tamanho || !e.cor) return null
    const prod = produtos.find((p) => p.id === produtoId)
    const v = prod?.variacoes.find((x) => tok(x.tamanho) === e.tamanho && tok(x.cor) === e.cor)
    return v?.id ?? null
  }

  function gerar() {
    if (!kit) return
    const escolhas: { kitItemId: string; variacaoId: string }[] = []
    for (const it of kit.itens) {
      const variacaoId = variacaoDe(it.produtoId, sel[it.id])
      if (!variacaoId) {
        toast.error('Escolha o tamanho e a cor de todos os itens')
        return
      }
      escolhas.push({ kitItemId: it.id, variacaoId })
    }

    startTransition(async () => {
      const result = await gerarOpsKitAction({
        kitId: kit.id,
        quantidade: n,
        canalDestino: canal,
        prioridade,
        escolhas,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'OPs geradas')
      setOpen(false)
      setQtd('1')
      setSel({})
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Combine />
        Gerar de kit
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Gerar OPs de um kit</DialogTitle>
            <DialogDescription>
              Escolha o kit, a quantidade e o tamanho/cor de cada componente.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
            <div className="space-y-1.5">
              <Label>Kit</Label>
              <Select
                value={kitId || null}
                onValueChange={(v) => trocarKit(v ?? '')}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o kit" />
                </SelectTrigger>
                <SelectContent>
                  {kits.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.nome} ({k.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="kit-qtd">Qtd de kits</Label>
                <Input
                  id="kit-qtd"
                  inputMode="numeric"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select
                  value={canal}
                  onValueChange={(v) => setCanal((v ?? 'estoque') as (typeof canalValues)[number])}
                  disabled={isPending}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canalValues.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CANAL_LABEL_CURTO[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select
                  value={prioridade}
                  onValueChange={(v) =>
                    setPrioridade((v ?? 'normal') as (typeof prioridadeValues)[number])
                  }
                  disabled={isPending}
                >
                  <SelectTrigger size="sm">
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

            {kit && (
              <div className="space-y-2">
                <Label>Componentes</Label>
                {kit.itens.map((it) => {
                  const prod = produtos.find((p) => p.id === it.produtoId)
                  const e = sel[it.id]
                  const tamanhos = prod ? distintos(prod.variacoes.map((v) => tok(v.tamanho))) : []
                  const cores = prod
                    ? distintos(
                        prod.variacoes
                          .filter((v) => tok(v.tamanho) === e?.tamanho)
                          .map((v) => tok(v.cor)),
                      )
                    : []
                  return (
                    <div key={it.id} className="space-y-2 rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate font-medium">{it.produtoNome}</span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {it.quantidade * n} un
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={e?.tamanho || null}
                          onValueChange={(v) => patchSel(it.id, { tamanho: v ?? '', cor: '' })}
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
                          value={e?.cor || null}
                          onValueChange={(v) => patchSel(it.id, { cor: v ?? '' })}
                          disabled={isPending || !e?.tamanho}
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
              </div>
            )}
          </div>

          <DialogFooter className="border-t p-6">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button loading={isPending} onClick={gerar} disabled={isPending || !kit}>
              {'Gerar OPs'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
