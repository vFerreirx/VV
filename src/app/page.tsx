import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Malharia MVP</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Sistema de gestão de produção. Bootstrap concluído (Fase 0).
        </p>
      </div>
      <Button render={<Link href="/login" />}>Entrar</Button>
    </main>
  )
}
