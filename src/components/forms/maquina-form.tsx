'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import {
  atualizarMaquinaAction,
  criarMaquinaAction,
} from '@/app/(app)/maquinas/actions'
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
import type { User } from '@/lib/db/schema'
import {
  maquinaSchema,
  STATUS_LABEL,
  TIPO_LABEL,
  maquinaStatusValues,
  maquinaTipoValues,
  type MaquinaInput,
} from '@/lib/validators/maquinas'

export type MaquinaFormDefaults = {
  id?: string
  codigo: string
  nome: string
  tipo: (typeof maquinaTipoValues)[number]
  status: (typeof maquinaStatusValues)[number]
  diametroPolegadas: string | null
  finura: number | null
  numAlimentadores: number | null
  capacidadeKgPorHora: string | null
  operadorAtualId: string | null
  ultimaManutencao: Date | null
  proximaManutencao: Date | null
  observacoes: string | null
}

const VAZIO: MaquinaFormDefaults = {
  codigo: '',
  nome: '',
  tipo: 'circular_medio',
  status: 'parada',
  diametroPolegadas: null,
  finura: null,
  numAlimentadores: null,
  capacidadeKgPorHora: null,
  operadorAtualId: null,
  ultimaManutencao: null,
  proximaManutencao: null,
  observacoes: null,
}

function dateToInput(d: Date | null): string {
  if (!d) return ''
  // Componente UTC -> YYYY-MM-DD
  return d.toISOString().slice(0, 10)
}

function toFormValues(d: MaquinaFormDefaults): MaquinaInput {
  return {
    codigo: d.codigo ?? '',
    nome: d.nome ?? '',
    tipo: d.tipo,
    status: d.status,
    diametroPolegadas: d.diametroPolegadas ?? '',
    finura: d.finura !== null ? String(d.finura) : '',
    numAlimentadores: d.numAlimentadores !== null ? String(d.numAlimentadores) : '',
    capacidadeKgPorHora: d.capacidadeKgPorHora ?? '',
    operadorAtualId: d.operadorAtualId ?? '',
    ultimaManutencao: dateToInput(d.ultimaManutencao),
    proximaManutencao: dateToInput(d.proximaManutencao),
    observacoes: d.observacoes ?? '',
  }
}

type Operador = Pick<User, 'id' | 'nome' | 'email' | 'role'>

export function MaquinaForm({
  defaults = VAZIO,
  operadores,
}: {
  defaults?: MaquinaFormDefaults
  operadores: Operador[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = Boolean(defaults.id)

  const form = useForm<MaquinaInput>({
    resolver: zodResolver(maquinaSchema) as unknown as Resolver<MaquinaInput>,
    defaultValues: toFormValues(defaults),
  })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = isEdit
        ? await atualizarMaquinaAction(defaults.id!, values)
        : await criarMaquinaAction(values)

      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message ?? 'Salvo')
      if (!isEdit && 'data' in result && result.data) {
        router.push(`/maquinas/${result.data.id}`)
      } else {
        router.refresh()
      }
    })
  })

  const errs = form.formState.errors

  // Operadores válidos pra atribuir = role 'operador' (RLS deixa esses
  // usuários atualizarem a própria máquina).
  const operadoresFiltered = operadores.filter((o) => o.role === 'operador')

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Código" id="codigo" error={errs.codigo?.message} required>
            <Input
              id="codigo"
              placeholder="TC-19"
              autoComplete="off"
              disabled={isPending}
              {...form.register('codigo')}
            />
          </Field>

          <Field label="Nome" id="nome" error={errs.nome?.message} required>
            <Input
              id="nome"
              placeholder="Tear Circular TC-19"
              disabled={isPending}
              {...form.register('nome')}
            />
          </Field>

          <Field label="Tipo" id="tipo" error={errs.tipo?.message} required>
            <Controller
              control={form.control}
              name="tipo"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value}
                  onValueChange={(v) => v && ctl.onChange(v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="tipo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {maquinaTipoValues.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Status" id="status" error={errs.status?.message} required>
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
                    {maquinaStatusValues.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Especificações técnicas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="Diâmetro (polegadas)"
            id="diametroPolegadas"
            error={errs.diametroPolegadas?.message}
          >
            <Input
              id="diametroPolegadas"
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              placeholder="30"
              disabled={isPending}
              {...form.register('diametroPolegadas')}
            />
          </Field>

          <Field label="Finura" id="finura" error={errs.finura?.message}>
            <Input
              id="finura"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              placeholder="22"
              disabled={isPending}
              {...form.register('finura')}
            />
          </Field>

          <Field
            label="Alimentadores"
            id="numAlimentadores"
            error={errs.numAlimentadores?.message}
          >
            <Input
              id="numAlimentadores"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              placeholder="72"
              disabled={isPending}
              {...form.register('numAlimentadores')}
            />
          </Field>

          <Field
            label="Capacidade (kg/h)"
            id="capacidadeKgPorHora"
            error={errs.capacidadeKgPorHora?.message}
          >
            <Input
              id="capacidadeKgPorHora"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="12.5"
              disabled={isPending}
              {...form.register('capacidadeKgPorHora')}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field
            label="Operador atual"
            id="operadorAtualId"
            error={errs.operadorAtualId?.message}
            hint="Apenas usuários com perfil 'Operador' aparecem aqui"
          >
            <Controller
              control={form.control}
              name="operadorAtualId"
              render={({ field: ctl }) => (
                <Select
                  value={ctl.value || 'nenhum'}
                  onValueChange={(v) => ctl.onChange(v === 'nenhum' ? '' : v)}
                  disabled={isPending}
                >
                  <SelectTrigger id="operadorAtualId" className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    {operadoresFiltered.length === 0 && (
                      <div className="text-muted-foreground p-2 text-xs">
                        Nenhum operador ativo cadastrado.
                      </div>
                    )}
                    {operadoresFiltered.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <div /> {/* placeholder pra grid */}

          <Field
            label="Última manutenção"
            id="ultimaManutencao"
            error={errs.ultimaManutencao?.message}
          >
            <Input
              id="ultimaManutencao"
              type="date"
              disabled={isPending}
              {...form.register('ultimaManutencao')}
            />
          </Field>

          <Field
            label="Próxima manutenção"
            id="proximaManutencao"
            error={errs.proximaManutencao?.message}
          >
            <Input
              id="proximaManutencao"
              type="date"
              disabled={isPending}
              {...form.register('proximaManutencao')}
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
              placeholder="Anotações sobre a máquina, histórico recente, etc."
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
          onClick={() => router.push('/maquinas')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar máquina'}
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
