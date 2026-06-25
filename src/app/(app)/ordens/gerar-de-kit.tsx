'use client'

import { Combine } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

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

function descVariacao(v: {
  cor: string | null
  tamanho: string | null
  modelo: string | null
}): string {
  return [v.tamanho, v.cor, v.modelo].filter(Boolean).join(' ') || 'padrão'
}

export function GerarDeKit({ kits }: { kits: KitComItens[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [kitId, setKitId] = useState(kits[0]?.id ?? '')
  const [qtd, setQtd] = useState('1')
  const [canal, setCanal] = useState<(typeof canalValues)[number]>('estoque')
  const [prioridade, setPrioridade] =
    useState<(typeof prioridadeValues)[number]>('normal')

  const kit = kits.find((k) => k.id === kitId) ?? null
  const n = Math.max(1, Number(qtd) || 1)

  function fechar() {
    setOpen(false)
  }

  function gerar() {
    if (!kit) return
    startTransition(async () => {
      const result = await gerarOpsKitAction({
        kitId: kit.id,
        quantidade: n,
        canalDestino: canal,
        prioridade,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'OPs geradas')
      setOpen(false)
      setQtd('1')
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Combine />
        Gerar de kit
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar OPs de um kit</DialogTitle>
            <DialogDescription>
              Cria uma ordem de produção separada pra cada componente do kit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Kit</Label>
              <Select
                value={kitId || undefined}
                onValueChange={(v) => setKitId(v ?? '')}
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
                  onValueChange={(v) =>
                    setCanal((v ?? 'estoque') as (typeof canalValues)[number])
                  }
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
                    setPrioridade(
                      (v ?? 'normal') as (typeof prioridadeValues)[number],
                    )
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
              <div className="rounded-lg border">
                <div className="text-muted-foreground border-b px-3 py-2 text-xs tracking-wide uppercase">
                  Vai gerar {kit.itens.length} OP
                  {kit.itens.length === 1 ? '' : 's'}
                </div>
                <ul className="divide-y text-sm">
                  {kit.itens.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <span className="min-w-0 truncate">
                        {it.produtoNome}{' '}
                        <span className="text-muted-foreground">
                          {descVariacao(it)}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {it.quantidade * n} un
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={gerar} disabled={isPending || !kit}>
              {isPending ? 'Gerando…' : 'Gerar OPs'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
