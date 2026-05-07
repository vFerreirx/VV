import type { Metadata } from 'next'
import Link from 'next/link'

import { RecuperarSenhaForm } from '@/components/forms/recuperar-senha-form'

export const metadata: Metadata = {
  title: 'Recuperar senha — Malharia MVP',
}

export default function RecuperarSenhaPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Recuperar senha</h1>
        <p className="text-muted-foreground text-sm">
          Enviamos um link pra você redefinir a senha
        </p>
      </div>
      <RecuperarSenhaForm />
      <div className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          Voltar pro login
        </Link>
      </div>
    </div>
  )
}
