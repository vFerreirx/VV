'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { alterarSenhaAction } from '@/app/(app)/configuracoes/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { alterarSenhaSchema, type AlterarSenhaInput } from '@/lib/validators/auth'

export function AlterarSenhaForm() {
  const [isPending, startTransition] = useTransition()

  const form = useForm<AlterarSenhaInput>({
    resolver: zodResolver(alterarSenhaSchema),
    defaultValues: { senhaAtual: '', novaSenha: '', confirmacao: '' },
  })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await alterarSenhaAction(values)
      if (result.success) {
        toast.success(result.message ?? 'Senha alterada')
        form.reset()
      } else {
        toast.error(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="senhaAtual">Senha atual</Label>
        <Input
          id="senhaAtual"
          type="password"
          autoComplete="current-password"
          disabled={isPending}
          {...form.register('senhaAtual')}
        />
        {form.formState.errors.senhaAtual && (
          <p className="text-destructive text-sm">{form.formState.errors.senhaAtual.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="novaSenha">Nova senha</Label>
        <Input
          id="novaSenha"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          {...form.register('novaSenha')}
        />
        {form.formState.errors.novaSenha && (
          <p className="text-destructive text-sm">{form.formState.errors.novaSenha.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmacao">Confirme a nova senha</Label>
        <Input
          id="confirmacao"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          {...form.register('confirmacao')}
        />
        {form.formState.errors.confirmacao && (
          <p className="text-destructive text-sm">{form.formState.errors.confirmacao.message}</p>
        )}
      </div>

      <Button loading={isPending} type="submit" disabled={isPending}>
        {'Alterar senha'}
      </Button>
    </form>
  )
}
