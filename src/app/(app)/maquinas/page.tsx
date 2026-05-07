import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Máquinas — Malharia MVP' }

export default function MaquinasPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Máquinas</h1>
      <p className="text-muted-foreground mt-1 text-sm">CRUD virá na Fase 6.</p>
    </div>
  )
}
