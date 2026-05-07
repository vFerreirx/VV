import type { Metadata } from 'next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = {
  title: 'Dashboard — Malharia MVP',
}

export default async function DashboardPage() {
  const user = await requireAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Bem-vindo, {user.nome.split(' ')[0]}. Cards de KPI virão na Fase 9.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          'OPs em andamento',
          'Máquinas operando',
          'Produção do dia (kg)',
          'OPs atrasadas',
        ].map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-xs font-medium uppercase">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-semibold">—</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
