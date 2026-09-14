'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarOrdemAction,
  criarOrdemAction,
  type ProdutoComVariacoesParaForm,
} from '@/app/(app)/ordens/actions'
import { erroDaVariacao } from '@/lib/producao/catalogo-op'
import { CatalogoOrdem } from '@/components/forms/catalogo-ordem'
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
import {
  CANAL_LABEL,
  STATUS_INICIAIS,
  STATUS_FILTRAVEIS,
  criarOrdemSchema,
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
  quantidade: number | string
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
  quantidade: '',
  maquinaId: null,
  canalDestino: 'estoque',
  prioridade: 'normal',
  status: 'programado',
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
    quantidade: String(d.quantidade ?? ''),
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

export function OrdemForm({
  defaults = VAZIO,
  produtos,
}: {
  defaults?: OrdemFormDefaults
  produtos: ProdutoComVariacoesParaForm[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(defaults.id)

  const form = useForm<OrdemInput>({
    resolver: zodResolver(
      isEdit ? ordemSchema : criarOrdemSchema,
    ) as unknown as Resolver<OrdemInput>,
    defaultValues: toFormValues(defaults),
  })

  const produtoId = useWatch({ control: form.control, name: 'produtoId' })
  const variacaoId = useWatch({ control: form.control, name: 'variacaoId' })
  const statusDisponiveis = isEdit ? STATUS_FILTRAVEIS : STATUS_INICIAIS
  const statusHistorico =
    isEdit && (defaults.status === 'acabamento' || defaults.status === 'embalagem')

  const onSubmit = form.handleSubmit((values) => {
    const produto = produtos.find((p) => p.id === values.produtoId)
    const selecaoMudou =
      values.produtoId !== defaults.produtoId || (values.variacaoId || null) !== defaults.variacaoId
    const erroVariacao =
      produto && (!isEdit || selecaoMudou)
        ? erroDaVariacao(values.variacaoId, produto.variacoes)
        : null
    if (erroVariacao) {
      form.setError('variacaoId', { message: erroVariacao })
      return
    }
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
          <div className="md:col-span-2">
            <CatalogoOrdem
              produtos={produtos}
              produtoId={produtoId}
              variacaoId={variacaoId ?? ''}
              disabled={isPending}
              error={errs.produtoId?.message ?? errs.variacaoId?.message}
              onChange={(produto, variacao) => {
                form.setValue('produtoId', produto, { shouldDirty: true })
                form.setValue('variacaoId', variacao, { shouldDirty: true })
                form.clearErrors(['produtoId', 'variacaoId'])
              }}
            />
          </div>

          <Field
            label="Quantidade (peças)"
            id="quantidade"
            error={errs.quantidade?.message}
            required
          >
            <Input
              id="quantidade"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              placeholder="100"
              disabled={isPending}
              {...form.register('quantidade')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planejamento da produção</CardTitle>
          <p className="text-muted-foreground text-sm">
            {isEdit
              ? 'As informações abaixo pertencem a esta OP. A produção é acompanhada na tela da estação.'
              : 'A OP entra na fila. Na tela da estação, o operador escolhe a máquina e inicia a produção.'}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
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
                  items={CANAL_LABEL}
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

          <Field label="Prioridade" id="prioridade" error={errs.prioridade?.message} required>
            <Controller
              control={form.control}
              name="prioridade"
              render={({ field: ctl }) => (
                <Select
                  items={PRIORIDADE_LABEL}
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
            label={isEdit ? 'Status' : 'Situação inicial'}
            id="status"
            error={errs.status?.message}
            required
          >
            <Controller
              control={form.control}
              name="status"
              render={({ field: ctl }) => (
                <Select
                  items={STATUS_LABEL}
                  value={ctl.value}
                  onValueChange={(v) => v && ctl.onChange(v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusHistorico && (
                      <SelectItem value={defaults.status} disabled>
                        {STATUS_LABEL[defaults.status]} (histórico)
                      </SelectItem>
                    )}
                    {statusDisponiveis.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {!isEdit ? (
            <p className="text-muted-foreground self-center text-sm">
              Programado: na fila para produção. Use Aguardando matéria-prima quando faltar
              material.
            </p>
          ) : (
            <div />
          )}

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

          <Field label="Fim previsto" id="dataPrevistaFim" error={errs.dataPrevistaFim?.message}>
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
        <Button loading={isPending} type="submit" disabled={isPending}>
          {isEdit ? 'Salvar alterações' : 'Criar OP'}
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
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
