import type { Metadata } from 'next'

import { AlterarSenhaForm } from '@/components/forms/alterar-senha-form'
import { PerfilForm } from '@/components/forms/perfil-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = {
  title: 'Configurações — Malharia MVP',
}

export default async function ConfiguracoesPage() {
  const user = await requireAuth()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie seu perfil e senha</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>
            Usuário: <span className="text-foreground font-mono">{user.username}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PerfilForm
            defaultValues={{
              nome: user.nome,
              telefone: user.telefone ?? '',
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Senha</CardTitle>
          <CardDescription>Confirmamos a senha atual antes de alterar.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlterarSenhaForm />
        </CardContent>
      </Card>
    </div>
  )
}
