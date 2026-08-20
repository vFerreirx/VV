'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  listarSaidasDoLote,
  registrarSaidaFioAction,
  type LoteFioItem,
  type SaidaFioItem,
} from './actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { saidaFioSchema, type SaidaFioInput } from '@/lib/validators/fios'

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

export function LoteDetailSheet({
  lote,
  podeEditar,
  onClose,
}: {
  lote: LoteFioItem | null
  podeEditar: boolean
  onClose: () => void
}) {
  return (
    <Sheet open={lote !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {/* Key força remontagem ao trocar de lote — evita setState em effect. */}
        {lote && (
          <DetalheBody key={lote.id} lote={lote} podeEditar={podeEditar} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetalheBody({
  lote,
  podeEditar,
  onClose,
}: {
  lote: LoteFioItem
  podeEditar: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [saidas, setSaidas] = useState<SaidaFioItem[] | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    let cancelado = false
    listarSaidasDoLote(lote.id).then((r) => {
      if (!cancelado) setSaidas(r)
    })
    return () => {
      cancelado = true
    }
  }, [lote.id])

  const esgotado = lote.saldoCaixas <= 0

  return (
    <>
      <SheetHeader>
        {/* Lote sem número existe de verdade (a planilha traz duas linhas
            assim) — o título cai na cor, que é o que identifica a caixa. */}
        <SheetTitle>
          {lote.numeroLote ?? `${lote.corFornecedorNome} · sem lote`}
        </SheetTitle>
        <SheetDescription>
          {lote.corFornecedorNome} → {lote.corNome}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Entrada</div>
            <div>
              {lote.caixas} cx · {formatarKg(lote.pesoTotalKg)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Saldo atual</div>
            <div className="flex items-center gap-2 font-medium">
              {lote.saldoCaixas} cx · {formatarKg(lote.saldoPesoKg)}
              {esgotado && <Badge variant="secondary">Esgotado</Badge>}
            </div>
          </div>
        </div>

        {podeEditar && !esgotado && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMostrarForm((v) => !v)}
          >
            <Plus />
            {mostrarForm ? 'Cancelar' : 'Registrar saída'}
          </Button>
        )}

        {mostrarForm && (
          <SaidaForm
            lote={lote}
            onDone={() => {
              setMostrarForm(false)
              router.refresh()
              onClose()
            }}
          />
        )}

        <div>
          <div className="mb-2 text-sm font-medium">Histórico de saídas</div>
          {saidas === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : saidas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma saída registrada.
            </p>
          ) : (
            <ul className="space-y-2">
              {saidas.map((s) => (
                <li key={s.id} className="rounded-lg border p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {s.caixas} cx · {formatarKg(s.pesoKg)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatarData(s.data)}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {s.motivo}
                    {s.usuarioNome ? ` · ${s.usuarioNome}` : ''}
                  </div>
                  {s.observacao && (
                    <div className="mt-1 text-xs">{s.observacao}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}

function SaidaForm({
  lote,
  onDone,
}: {
  lote: LoteFioItem
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [pesoTocado, setPesoTocado] = useState(false)

  const form = useForm<SaidaFioInput>({
    resolver: zodResolver(saidaFioSchema) as unknown as Resolver<SaidaFioInput>,
    defaultValues: {
      loteId: lote.id,
      caixas: '',
      pesoKg: '',
      data: hojeISO(),
      motivo: '',
      observacao: '',
    },
  })

  const errs = form.formState.errors
  const caixas = useWatch({ control: form.control, name: 'caixas' })

  useEffect(() => {
    if (pesoTocado) return
    const n = Number(caixas)
    if (!Number.isFinite(n) || n <= 0 || lote.caixas <= 0) return
    const pesoMedioPorCaixa = Number(lote.pesoTotalKg) / lote.caixas
    form.setValue('pesoKg', (n * pesoMedioPorCaixa).toFixed(2), {
      shouldDirty: true,
    })
  }, [caixas, pesoTocado, form, lote])

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await registrarSaidaFioAction(values)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Saída registrada')
      onDone()
    })
  })

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border p-3"
      noValidate
    >
      <p className="text-muted-foreground text-xs">
        Saldo disponível: {lote.saldoCaixas} cx · {formatarKg(lote.saldoPesoKg)}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sf-caixas">
            Caixas <span className="text-destructive">*</span>
          </Label>
          <Input
            id="sf-caixas"
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
          <Label htmlFor="sf-peso">
            Peso (kg) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="sf-peso"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            disabled={isPending}
            {...form.register('pesoKg', { onChange: () => setPesoTocado(true) })}
          />
          {errs.pesoKg && (
            <p className="text-destructive text-xs">{errs.pesoKg.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-data">
          Data <span className="text-destructive">*</span>
        </Label>
        <Input
          id="sf-data"
          type="date"
          disabled={isPending}
          {...form.register('data')}
        />
        {errs.data && (
          <p className="text-destructive text-xs">{errs.data.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-motivo">
          Motivo <span className="text-destructive">*</span>
        </Label>
        <Input
          id="sf-motivo"
          placeholder="Ex.: produção, perda, devolução ao fornecedor"
          disabled={isPending}
          {...form.register('motivo')}
        />
        {errs.motivo && (
          <p className="text-destructive text-xs">{errs.motivo.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sf-obs">Observação</Label>
        <Textarea
          id="sf-obs"
          rows={2}
          disabled={isPending}
          {...form.register('observacao')}
        />
      </div>

      <Button loading={isPending} type="submit" size="sm" disabled={isPending}>
        {'Registrar saída'}
      </Button>
    </form>
  )
}
