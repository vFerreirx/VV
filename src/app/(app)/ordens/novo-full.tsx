'use client'

import { PackageOpen, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { listarProdutosParaOrdem } from './actions'
import {
  criarOpsFullAction,
  type RemessaFullOpcao,
} from './remessas-actions'
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
  prioridadeValues,
} from '@/lib/validators/ordens'
import { fullCanalValues } from '@/lib/validators/remessas'

type Produtos = Awaited<ReturnType<typeof listarProdutosParaOrdem>>

// Token interno pra tamanho/cor nulos no <Select>. '' = não escolhido.
const SEM = '__sem__'
const tok = (s: string | null) => s ?? SEM
const rotuloTok = (v: string) => (v === SEM ? '—' : v)
const distintos = <T,>(arr: T[]): T[] => [...new Set(arr)]

function labelRemessa(r: RemessaFullOpcao): string {
  const [, m, d] = r.dataEnvio.split('-')
  return `${CANAL_LABEL_CURTO[r.canal]} · ${d}/${m} (${r.ops} OPs)`
}

type Linha = {
  produtoId: string
  tamanho: string
  cor: string
  quantidade: string
}

const LINHA_VAZIA: Linha = { produtoId: '', tamanho: '', cor: '', quantidade: '' }

export function NovoFull({
  remessas,
  produtos,
}: {
  remessas: RemessaFullOpcao[]
  produtos: Produtos
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  // 'nova' = criar um Full novo; senão, id do Full existente.
  const [remessaSel, setRemessaSel] = useState<string>('nova')
  const [canal, setCanal] =
    useState<(typeof fullCanalValues)[number]>('full_ml')
  const [dataEnvio, setDataEnvio] = useState('')
  const [prioridade, setPrioridade] =
    useState<(typeof prioridadeValues)[number]>('normal')
  const [linhas, setLinhas] = useState<Linha[]>([{ ...LINHA_VAZIA }])

  function patchLinha(idx: number, patch: Partial<Linha>) {
    setLinhas((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    )
  }
  function addLinha() {
    setLinhas((prev) => [...prev, { ...LINHA_VAZIA }])
  }
  function removeLinha(idx: number) {
    setLinhas((prev) => prev.filter((_, i) => i !== idx))
  }

  function variacaoDe(l: Linha): string | null {
    const prod = produtos.find((p) => p.id === l.produtoId)
    const v = prod?.variacoes.find(
      (x) => tok(x.tamanho) === l.tamanho && tok(x.cor) === l.cor,
    )
    return v?.id ?? null
  }

  const totalUn = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0), 0)

  function criar() {
    const itens: { variacaoId: string; quantidade: number }[] = []
    for (const l of linhas) {
      if (!l.produtoId) continue
      const variacaoId = variacaoDe(l)
      if (!variacaoId) {
        toast.error('Escolha tamanho e cor de todos os produtos')
        return
      }
      itens.push({
        variacaoId,
        quantidade: Math.max(1, Number(l.quantidade) || 1),
      })
    }
    if (itens.length === 0) {
      toast.error('Adicione ao menos um produto')
      return
    }
    if (remessaSel === 'nova' && !dataEnvio) {
      toast.error('Informe a data de envio do Full')
      return
    }

    startTransition(async () => {
      const result = await criarOpsFullAction({
        remessaId: remessaSel === 'nova' ? undefined : remessaSel,
        canal: remessaSel === 'nova' ? canal : undefined,
        dataEnvio: remessaSel === 'nova' ? dataEnvio : undefined,
        prioridade,
        itens,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'OPs criadas')
      setOpen(false)
      setLinhas([{ ...LINHA_VAZIA }])
      setRemessaSel('nova')
      setDataEnvio('')
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PackageOpen />
        Novo Full
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b p-6">
            <DialogTitle>Cadastrar Full</DialogTitle>
            <DialogDescription>
              Crie o Full (canal + data de envio) e os produtos dele — cada
              produto vira uma OP com a data de envio como prazo.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto p-6">
            {/* Full novo ou existente */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Full</Label>
                <Select
                  value={remessaSel}
                  onValueChange={(v) => setRemessaSel(v ?? 'nova')}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nova">Novo Full…</SelectItem>
                    {remessas.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {labelRemessa(r)}
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
                  <SelectTrigger className="w-full">
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

            {remessaSel === 'nova' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Canal</Label>
                  <Select
                    value={canal}
                    onValueChange={(v) =>
                      setCanal(
                        (v ?? 'full_ml') as (typeof fullCanalValues)[number],
                      )
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fullCanalValues.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CANAL_LABEL_CURTO[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="full-data">Data de envio</Label>
                  <Input
                    id="full-data"
                    type="date"
                    value={dataEnvio}
                    onChange={(e) => setDataEnvio(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
            )}

            {/* Produtos do Full */}
            <div className="space-y-2">
              <Label>Produtos</Label>
              {linhas.map((linha, idx) => {
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
                          patchLinha(idx, {
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
                        aria-label="Quantidade"
                        placeholder="qtd"
                        value={linha.quantidade}
                        onChange={(e) =>
                          patchLinha(idx, {
                            quantidade: e.target.value.replace(/\D/g, ''),
                          })
                        }
                        disabled={isPending}
                        className="h-9 w-16 text-center"
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => removeLinha(idx)}
                        disabled={isPending || linhas.length === 1}
                        aria-label="Remover"
                      >
                        <X />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={linha.tamanho || undefined}
                        onValueChange={(v) =>
                          patchLinha(idx, { tamanho: v ?? '', cor: '' })
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
                        onValueChange={(v) => patchLinha(idx, { cor: v ?? '' })}
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
                onClick={addLinha}
                disabled={isPending}
              >
                <Plus />
                Adicionar produto
              </Button>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between border-t p-6 sm:justify-between">
            <span className="text-sm">
              <span className="text-muted-foreground">Total: </span>
              <span className="font-semibold tabular-nums">
                {totalUn.toLocaleString('pt-BR')} un
              </span>
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button onClick={criar} disabled={isPending}>
                {isPending ? 'Criando…' : 'Criar OPs do Full'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
