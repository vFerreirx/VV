'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { PackageMinus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarLoteFioAction,
  criarLoteFioAction,
  excluirLoteFioAction,
  type CorFornecedorItem,
  type LoteFioItem,
} from './actions'
import { LoteDetailSheet } from './lote-detail-sheet'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  PESO_PADRAO_CAIXA_KG,
  loteFioSchema,
  type LoteFioInput,
} from '@/lib/validators/fios'

type Props = {
  lotes: LoteFioItem[]
  coresFornecedorAtivas: CorFornecedorItem[]
  podeEditar: boolean
}

function formatarReais(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarKg(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  if (!ano || !mes || !dia) return iso
  return `${dia}/${mes}/${ano}`
}

function hojeISO(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function LotesFioList({ lotes, coresFornecedorAtivas, podeEditar }: Props) {
  const [editing, setEditing] = useState<LoteFioItem | 'novo' | null>(null)
  const [excluindo, setExcluindo] = useState<LoteFioItem | null>(null)
  const [verLote, setVerLote] = useState<LoteFioItem | null>(null)

  return (
    <div className="space-y-4">
      {podeEditar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing('novo')}>
            <Plus />
            Nova entrada de lote
          </Button>
        </div>
      )}

      {lotes.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma entrada de lote cadastrada.
          </p>
          {podeEditar && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setEditing('novo')}
              disabled={coresFornecedorAtivas.length === 0}
            >
              Cadastrar primeira entrada
            </Button>
          )}
          {podeEditar && coresFornecedorAtivas.length === 0 && (
            <p className="text-muted-foreground mt-2 text-xs">
              Cadastre antes uma cor de fornecedor na aba &quot;Cores do
              fornecedor&quot;.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Caixas</TableHead>
                <TableHead>Peso total</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Valor total</TableHead>
                <TableHead>R$/kg</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lotes.map((l) => {
                const rsPorKg =
                  Number(l.pesoTotalKg) > 0
                    ? Number(l.valorTotal) / Number(l.pesoTotalKg)
                    : null
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {l.numeroLote}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {l.corHex && (
                          <span
                            className="size-3.5 shrink-0 rounded border ring-1 ring-foreground/10"
                            style={{ backgroundColor: l.corHex }}
                          />
                        )}
                        <span>
                          {l.corFornecedorNome}
                          <span className="text-muted-foreground">
                            {' '}
                            → {l.corNome}
                          </span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{l.caixas}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarKg(l.pesoTotalKg)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>
                          {l.saldoCaixas} cx · {formatarKg(l.saldoPesoKg)}
                        </span>
                        {l.saldoCaixas <= 0 && (
                          <Badge variant="secondary">Esgotado</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarReais(l.valorTotal)}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {rsPorKg == null ? '—' : formatarReais(rsPorKg)}
                    </TableCell>
                    <TableCell>{l.vendedor}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(l.vencimentoPagamento)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setVerLote(l)}
                          aria-label="Ver saídas"
                        >
                          <PackageMinus />
                        </Button>
                        {podeEditar && (
                          <>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setEditing(l)}
                              aria-label="Editar"
                            >
                              <Pencil />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setExcluindo(l)}
                              aria-label="Excluir"
                            >
                              <Trash2 className="text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <LoteFioDialog
        lote={editing}
        coresFornecedorAtivas={coresFornecedorAtivas}
        onClose={() => setEditing(null)}
      />

      <ExcluirDialog lote={excluindo} onClose={() => setExcluindo(null)} />

      <LoteDetailSheet
        lote={verLote}
        podeEditar={podeEditar}
        onClose={() => setVerLote(null)}
      />
    </div>
  )
}

function LoteFioDialog({
  lote,
  coresFornecedorAtivas,
  onClose,
}: {
  lote: LoteFioItem | 'novo' | null
  coresFornecedorAtivas: CorFornecedorItem[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = lote && lote !== 'novo'
  const open = lote !== null
  // Só recalcula o peso sugerido (caixas × 32) automaticamente enquanto o
  // usuário não tiver mexido no campo de peso na mão (lote novo ou troca
  // de caixas). Em edição, preserva o peso real já salvo. Reseta ao trocar
  // de lote/reabrir o dialog — ajustado durante a renderização (não em
  // efeito) seguindo o padrão do React de derivar estado a partir de props.
  const loteKey = isEdit ? lote.id : lote === 'novo' ? 'novo' : null
  const [pesoTocado, setPesoTocado] = useState(Boolean(isEdit))
  const [loteKeyAnterior, setLoteKeyAnterior] = useState(loteKey)
  if (loteKey !== loteKeyAnterior) {
    setLoteKeyAnterior(loteKey)
    setPesoTocado(Boolean(isEdit))
  }

  const form = useForm<LoteFioInput>({
    resolver: zodResolver(loteFioSchema) as unknown as Resolver<LoteFioInput>,
    values: {
      numeroLote: isEdit ? lote.numeroLote : '',
      corFornecedorId: isEdit ? lote.corFornecedorId : '',
      caixas: isEdit ? lote.caixas : '',
      pesoTotalKg: isEdit ? lote.pesoTotalKg : '',
      valorTotal: isEdit ? lote.valorTotal : '',
      vendedor: isEdit ? lote.vendedor : '',
      dataEntrada: isEdit ? lote.dataEntrada : hojeISO(),
      vencimentoPagamento: isEdit ? lote.vencimentoPagamento : '',
      notaFiscal: isEdit ? (lote.notaFiscal ?? '') : '',
      observacao: isEdit ? (lote.observacao ?? '') : '',
    },
  })

  const errs = form.formState.errors
  const caixas = useWatch({ control: form.control, name: 'caixas' })
  const valorTotal = useWatch({ control: form.control, name: 'valorTotal' })
  const pesoTotalKg = useWatch({ control: form.control, name: 'pesoTotalKg' })

  useEffect(() => {
    if (pesoTocado) return
    const n = Number(caixas)
    if (!Number.isFinite(n) || n <= 0) return
    form.setValue('pesoTotalKg', String(n * PESO_PADRAO_CAIXA_KG), {
      shouldDirty: true,
    })
  }, [caixas, pesoTocado, form])

  const rsPorKg =
    Number(valorTotal) > 0 && Number(pesoTotalKg) > 0
      ? (Number(valorTotal) / Number(pesoTotalKg)).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        })
      : null

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarLoteFioAction(lote.id, values)
        : await criarLoteFioAction(values)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      router.refresh()
      onClose()
      form.reset()
      setPesoTocado(false)
    })
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar entrada de lote' : 'Nova entrada de lote'}
          </DialogTitle>
          <DialogDescription>
            O peso total sugere caixas × {PESO_PADRAO_CAIXA_KG}kg, mas pode
            ser ajustado se o lote vier diferente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lf-numero">
                Número/código do lote <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-numero"
                autoFocus
                disabled={isPending}
                {...form.register('numeroLote')}
              />
              {errs.numeroLote && (
                <p className="text-destructive text-xs">
                  {errs.numeroLote.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-cor">
                Cor do fornecedor <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="corFornecedorId"
                render={({ field: ctl }) => (
                  <Select
                    value={ctl.value}
                    onValueChange={(v) => v && ctl.onChange(v)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="lf-cor" className="w-full">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {coresFornecedorAtivas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nomeFornecedor} → {c.corNome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errs.corFornecedorId && (
                <p className="text-destructive text-xs">
                  {errs.corFornecedorId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-caixas">
                Caixas <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-caixas"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                disabled={isPending}
                {...form.register('caixas')}
              />
              {errs.caixas && (
                <p className="text-destructive text-xs">{errs.caixas.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-peso">
                Peso total (kg) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-peso"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                disabled={isPending}
                {...form.register('pesoTotalKg', {
                  onChange: () => setPesoTocado(true),
                })}
              />
              {errs.pesoTotalKg && (
                <p className="text-destructive text-xs">
                  {errs.pesoTotalKg.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-valor">
                Valor total (R$) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-valor"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                disabled={isPending}
                {...form.register('valorTotal')}
              />
              {errs.valorTotal && (
                <p className="text-destructive text-xs">
                  {errs.valorTotal.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">R$/kg</Label>
              <p className="text-muted-foreground flex h-9 items-center text-sm">
                {rsPorKg ?? '—'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-vendedor">
                Vendedor <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-vendedor"
                disabled={isPending}
                {...form.register('vendedor')}
              />
              {errs.vendedor && (
                <p className="text-destructive text-xs">
                  {errs.vendedor.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-nota">Nota fiscal</Label>
              <Input
                id="lf-nota"
                disabled={isPending}
                {...form.register('notaFiscal')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-data-entrada">
                Data de entrada <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-data-entrada"
                type="date"
                disabled={isPending}
                {...form.register('dataEntrada')}
              />
              {errs.dataEntrada && (
                <p className="text-destructive text-xs">
                  {errs.dataEntrada.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lf-vencimento">
                Vencimento do pagamento{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-vencimento"
                type="date"
                disabled={isPending}
                {...form.register('vencimentoPagamento')}
              />
              {errs.vencimentoPagamento && (
                <p className="text-destructive text-xs">
                  {errs.vencimentoPagamento.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lf-obs">Observação</Label>
            <Textarea
              id="lf-obs"
              rows={2}
              disabled={isPending}
              {...form.register('observacao')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ExcluirDialog({
  lote,
  onClose,
}: {
  lote: LoteFioItem | null
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function excluir() {
    if (!lote) return
    startTransition(async () => {
      const result = await excluirLoteFioAction(lote.id)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Excluído')
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open={lote !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir entrada de lote?</DialogTitle>
          <DialogDescription>
            O lote {lote?.numeroLote} será marcado como excluído.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={excluir}
            disabled={isPending}
          >
            {isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
