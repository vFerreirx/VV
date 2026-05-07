import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Produtos — Malharia MVP' }

export default function ProdutosPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Produtos</h1>
      <p className="text-muted-foreground mt-1 text-sm">CRUD virá na Fase 5.</p>
    </div>
  )
}
