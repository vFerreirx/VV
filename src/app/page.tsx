import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth/get-user'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Logo variant="full" />
      <p className="text-muted-foreground max-w-sm text-center text-sm">
        Sistema de gestão de produção e estoque da Vanvest Home Decor.
      </p>
      <Button render={<Link href="/login" />} size="lg">
        Entrar
      </Button>
    </main>
  )
}
