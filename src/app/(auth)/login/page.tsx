import type { Metadata } from 'next'

import { LoginForm } from '@/components/forms/login-form'

export const metadata: Metadata = {
  title: 'Entrar — Vanvest',
}

type SearchParams = { [key: string]: string | string[] | undefined }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="text-muted-foreground text-sm">Acesse o painel</p>
      </div>
      <LoginForm next={next} />
    </div>
  )
}
