'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useMemo, useTransition } from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarOrdemAction,
  criarOrdemAction,
  type ProdutoComVariacoesParaForm,
} from '@/app/(app)/ordens/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Maquina, User } from '@/lib/db/schema'
import {
  CANAL_LABEL,
  PRIORIDADE_LABEL,
  STATUS_LABEL,
  canalValues,
  ordemSchema,
  prioridadeValues,
  statusValues,
  type OrdemInput,
} from '@/lib/validators/ordens'

export type OrdemFormDefaults = {
  id?: string
  numero?: string
  produtoId: string
  variacaoId: string | null
  quantidadeKg: string
  maquinaId: string | null
  canalDestino: (typeof canalValues)[number]
  prioridade: (typeof prioridadeValues)[number]
  status: (typeof statusValues)[number]
  dataPrevistaInicio: Date | null
  dataPrevistaFim: Date | null
  responsavelId: string | null
  observacoes: string | null
}

const VAZIO: OrdemFormDefaults = {
  produtoId: '',
  variacaoId: null,
  quantidadeKg: '',
  maquinaId: null,
  canalDestino: 'estoque',
  prioridade: 'normal',
  status: 'aguardando_materia_prima',
  dataPrevistaInicio: null,
  dataPrevistaFim: null,
  responsavelId: null,
  observacoes: null,
}

function dateToInput(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

function toFormValues(d: OrdemFormDefaults): OrdemInput {
  return {
    produtoId: d.produtoId,
    variacaoId: d.variacaoId ?? '',
    quantidadeKg: d.quantidadeKg,
    maquinaId: d.maquinaId ?? '',
    canalDestino: d.canalDestino,
    prioridade: d.prioridade,
    status: d.status,
    dataPrevistaInicio: dateToInput(d.dataPrevistaInicio),
    dataPrevistaFim: dateToInput(d.dataPrevistaFim),
    responsavelId: d.responsavelId ?? '',
    observacoes: d.observacoes ?? '',
  }
}

type Operador = Pick<User, 'id' | 'nome' | 'email' | 'role'>

export function OrdemForm({
  defaults = VAZIO,
  produtos,
  maquinas,
  responsaveis,
}: {
  defaults?: OrdemFormDefaults
  produtos: ProdutoComVariacoesParaForm[]
  maquinas: Array<Pick<Maquina, 'id' | 'codigo' | 'nome' | 'status'>>
  responsaveis: Operador[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(defaults.id)

  const form = useForm<OrdemInput>({
    resolver: zodResolver(ordemSchema) as unknown as Resolver<OrdemInput>,
    defaultValues: toFormValues(defaults),
  })

  // Estado reativo dos campos que afetam UI (variações disponíveis, metros).
  const produtoIdSelecionado = useWatch({
    control: form.control,
    name: 'produtoId',
  })
  const quantidadeKg = useWatch({ control: form.control, name: 'quantidadeKg' })

  const produtoSelecionado = useMemo(
    () => produtos.find((p) => p.id === produtoIdSelecionado),
    [produtos, produtoIdSelecionado],
  )

  const variacoesDisponiveis = produtoSelecionado?.variacoes ?? []

  // Cálculo dos metros (preview, mesma fórmula do servidor).
  const metrosPreview = useMemo(() => {
    if (!produtoSelecionado || !quantidadeKg) return null
    const kg = Number(quantidadeKg)
    const r = Number(produtoSelecionado.rendimentoKgPorMetro ?? '0')
    if (Number.isNaN(kg) || Number.isNaN(r) || r <= 0) return null
    return (kg / r).toFixed(2)
  }, [produtoSelecionado, quantidadeKg])

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarOrdemAction(defaults.id!, values)
        : await criarOrdemAction(values)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      if (!isEdit && 'data' in result && result.data) {
        router.push(`/ordens/${result.data.id}`)
      } else {
        router.refresh()
      }
    })
  })

  const errs = form.formState.errors

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Produto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="Produto"
            id="produtoId"
            error={errs.produtoId?.message}
            required
            className="md:col-span-2"
          >
            <Controller
              control={form.control}
              name="produtoId"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value || ''}
                  onValueChange={(v) => {
                    ctl.onChange(v ?? '')
                    // Reseta variação quando troca produto.
                    form.setValue('variacaoId', '', { shouldDirty: true })
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger id="produtoId" className="w-full">
                    <SelectValue placeholder="Selecione um produto…" />
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.length === 0 && (
                      <div className="text-muted-foreground p-2 text-xs">
                        Nenhum produto ativo cadastrado.
                      </div>
                    )}
                    {produtos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-mono text-xs">{p.sku}</span>
                        <span>—</span>
                        <span>{p.nome}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field
            label="Variação"
            id="variacaoId"
            error={errs.variacaoId?.message}
            hint={
              produtoSelecionado && variacoesDisponiveis.length === 0
                ? 'Esse produto não tem variações cadastradas.'
                : undefined
            }
          >
            <Controller
              control={form.control}
              name="variacaoId"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value || 'nenhuma'}
                  onValueChange={(v) => ctl.onChange(v === 'nenhuma' ? '' : v)}
                  disabled={
                    isPending ||
                    !produtoSelecionado ||
                    variacoesDisponiveis.length === 0
                  }
                >
                  <SelectTrigger id="variacaoId" className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem variação</SelectItem>
                    {variacoesDisponiveis.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {[v.cor, v.tamanho].filter(Boolean).join(' / ') ||
                          v.skuVariacao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field
            label="Quantidade (kg)"
            id="quantidadeKg"
            error={errs.quantidadeKg?.message}
            required
            hint={
              metrosPreview
                ? `≈ ${metrosPreview} m (a ${produtoSelecionado?.rendimentoKgPorMetro ?? '?'} kg/m)`
                : produtoSelecionado &&
                    !produtoSelecionado.rendimentoKgPorMetro
                  ? 'Sem rendimento cadastrado no produto — metros não será calculado.'
                  : undefined
            }
          >
            <Input
              id="quantidadeKg"
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              placeholder="100.000"
              disabled={isPending}
              {...form.register('quantidadeKg')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roteiro de produção</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="Máquina"
            id="maquinaId"
            error={errs.maquinaId?.message}
            hint="Pode ser definida agora ou depois ao iniciar a produção."
          >
            <Controller
              control={form.control}
              name="maquinaId"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value || 'nenhuma'}
                  onValueChange={(v) => ctl.onChange(v === 'nenhuma' ? '' : v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="maquinaId" className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Sem máquina</SelectItem>
                    {maquinas.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="font-mono text-xs">{m.codigo}</span>
                        <span>—</span>
                        <span>{m.nome}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field
            label="Responsável"
            id="responsavelId"
            error={errs.responsavelId?.message}
          >
            <Controller
              control={form.control}
              name="responsavelId"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value || 'nenhum'}
                  onValueChange={(v) => ctl.onChange(v === 'nenhum' ? '' : v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="responsavelId" className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem responsável</SelectItem>
                    {responsaveis.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field
            label="Canal de destino"
            id="canalDestino"
            error={errs.canalDestino?.message}
            required
          >
            <Controller
              control={form.control}
              name="canalDestino"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value}
                  onValueChange={(v) => v && ctl.onChange(v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="canalDestino" className="w-full">
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
              )}
            />
          </Field>

          <Field
            label="Prioridade"
            id="prioridade"
            error={errs.prioridade?.message}
            required
          >
            <Controller
              control={form.control}
              name="prioridade"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value}
                  onValueChange={(v) => v && ctl.onChange(v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="prioridade" className="w-full">
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
              )}
            />
          </Field>

          <Field
            label="Status"
            id="status"
            error={errs.status?.message}
            required
          >
            <Controller
              control={form.control}
              name="status"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value}
                  onValueChange={(v) => v && ctl.onChange(v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusValues.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <div /> {/* placeholder pra grid */}

          <Field
            label="Início previsto"
            id="dataPrevistaInicio"
            error={errs.dataPrevistaInicio?.message}
          >
            <Input
              id="dataPrevistaInicio"
              type="date"
              disabled={isPending}
              {...form.register('dataPrevistaInicio')}
            />
          </Field>

          <Field
            label="Fim previsto"
            id="dataPrevistaFim"
            error={errs.dataPrevistaFim?.message}
          >
            <Input
              id="dataPrevistaFim"
              type="date"
              disabled={isPending}
              {...form.register('dataPrevistaFim')}
            />
          </Field>

          <Field
            label="Observações"
            id="observacoes"
            error={errs.observacoes?.message}
            className="md:col-span-2"
          >
            <Textarea
              id="observacoes"
              rows={3}
              placeholder="Anotações da OP, requisitos especiais, etc."
              disabled={isPending}
              {...form.register('observacoes')}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/ordens')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar OP'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  id,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label htmlFor={id} className="text-sm">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
