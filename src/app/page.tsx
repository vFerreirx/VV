import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth/get-user'

export default async function HomePage() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Malharia MVP</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Sistema de gestão de produção e estoque Full ML/Shopee.
        </p>
      </div>
      <Button render={<Link href="/login" />}>Entrar</Button>
    </main>
  )
}
