'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { loginAction } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginSchema, type LoginInput } from '@/lib/validators/auth'

export function LoginForm({ next }: { next?: string }) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  })

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await loginAction(values, next)
      // Sucesso resulta em redirect — só caímos aqui se houve erro.
      if (result && !result.success) {
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="senha">Senha</Label>
          <Link
            href="/recuperar-senha"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Esqueceu?
          </Link>
        </div>
        <Input
          id="senha"
          type="password"
          autoComplete="current-password"
          disabled={isPending}
          {...form.register('senha')}
        />
        {form.formState.errors.senha && (
          <p className="text-destructive text-sm">{form.formState.errors.senha.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
