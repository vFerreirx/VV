import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produção — Malharia MVP' }

export default function ProducaoPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Produção</h1>
      <p className="text-muted-foreground mt-1 text-sm">Kanban virá na Fase 8.</p>
    </div>
  )
}
