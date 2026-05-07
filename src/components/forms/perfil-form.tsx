'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { atualizarPerfilAction } from '@/app/(app)/configuracoes/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  atualizarPerfilSchema,
  type AtualizarPerfilInput,
} from '@/lib/validators/auth'

export function PerfilForm({
  defaultValues,
}: {
  defaultValues: AtualizarPerfilInput
}) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<AtualizarPerfilInput>({
    resolver: zodResolver(atualizarPerfilSchema),
    defaultValues,
  })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await atualizarPerfilAction(values)
      if (result.success) {
        toast.success(result.message ?? 'Perfil atualizado')
        form.reset(values)
      } else {
        toast.error(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" disabled={isPending} {...form.register('nome')} />
        {form.formState.errors.nome && (
          <p className="text-destructive text-sm">{form.formState.errors.nome.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="telefone">Telefone</Label>
        <Input
          id="telefone"
          inputMode="tel"
          disabled={isPending}
          {...form.register('telefone')}
        />
        {form.formState.errors.telefone && (
          <p className="text-destructive text-sm">{form.formState.errors.telefone.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending || !form.formState.isDirty}>
        {isPending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
