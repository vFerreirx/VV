import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ordens — Malharia MVP' }

export default function OrdensPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Ordens de produção</h1>
      <p className="text-muted-foreground mt-1 text-sm">CRUD virá na Fase 7.</p>
    </div>
  )
}
