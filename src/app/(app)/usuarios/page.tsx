import type { Metadata } from 'next'

import { listarUsuarios } from './actions'
import { UsuariosList } from './usuarios-list'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Usuários — Vanvest' }

export default async function UsuariosPage() {
  const adminUser = await requireRole(['admin'])
  const usuarios = await listarUsuarios()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {usuarios.length} usuário{usuarios.length === 1 ? '' : 's'} cadastrado
          {usuarios.length === 1 ? '' : 's'}
        </p>
      </div>

      <UsuariosList usuarios={usuarios} selfId={adminUser.id} />
    </div>
  )
}
