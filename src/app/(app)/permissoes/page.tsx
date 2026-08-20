import type { Metadata } from 'next'

import { PermissoesEditor } from './permissoes-editor'
import { requireRole } from '@/lib/auth/require-auth'
import { carregarOverrides } from '@/lib/auth/permissoes-db'

export const metadata: Metadata = { title: 'Permissões — Vanvest' }

export default async function PermissoesPage() {
  await requireRole(['admin'])
  const overrides = await carregarOverrides()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Permissões dos cargos</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ligue ou desligue o acesso de cada cargo às áreas do sistema. Só o Administrador fica fixo
          (acesso total a tudo). Dentro de cada área, quem cria e edita segue a regra de cada ação.
        </p>
      </div>

      <PermissoesEditor overrides={overrides} />
    </div>
  )
}
