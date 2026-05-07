'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { recuperarSenhaAction } from '@/app/(auth)/recuperar-senha/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  recuperarSenhaSchema,
  type RecuperarSenhaInput,
} from '@/lib/validators/auth'

export function RecuperarSenhaForm() {
  const [isPending, startTransition] = useTransition()

  const form = useForm<RecuperarSenhaInput>({
    resolver: zodResolver(recuperarSenhaSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await recuperarSenhaAction(values)
      if (result.success) {
        toast.success(result.message)
        form.reset()
      } else {
        toast.error(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          disabled={isPending}
          {...form.register('email')}
        />
        {form.formState.errors.email && (
          <p className="text-destructive text-sm">{form.formState.errors.email.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Enviando…' : 'Enviar link de recuperação'}
      </Button>
    </form>
  )
}
