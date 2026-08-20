'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Controller, useForm, type Resolver } from 'react-hook-form'
import { toast } from 'sonner'

import { atualizarMaquinaAction, criarMaquinaAction } from '@/app/(app)/maquinas/actions'
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
  maquinaStatusValues,
  type MaquinaInput,
} from '@/lib/validators/maquinas'

export type MaquinaFormDefaults = {
  id?: string
  codigo: string
  nome: string
  status: (typeof maquinaStatusValues)[number]
  operadorAtualId: string | null
  observacoes: string | null
}

const VAZIO: MaquinaFormDefaults = {
  codigo: '',
  nome: '',
  status: 'parada',
  operadorAtualId: null,
  observacoes: null,
}

function toFormValues(d: MaquinaFormDefaults): MaquinaInput {
  return {
    codigo: d.codigo ?? '',
    nome: d.nome ?? '',
    status: d.status,
    operadorAtualId: d.operadorAtualId ?? '',
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
              placeholder="M-01"
              autoComplete="off"
              disabled={isPending}
              {...form.register('codigo')}
            />
          </Field>

          <Field label="Nome" id="nome" error={errs.nome?.message} required>
            <Input
              id="nome"
              placeholder="Overlock M-01"
              disabled={isPending}
              {...form.register('nome')}
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
          onClick={() => router.push('/fabrica')}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button loading={isPending} type="submit" disabled={isPending}>
          {isEdit ? 'Salvar alterações' : 'Criar máquina'}
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
