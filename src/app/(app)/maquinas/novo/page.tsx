import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { listarOperadores } from '../actions'
import { MaquinaForm } from '@/components/forms/maquina-form'
import { Button } from '@/components/ui/button'
import { requireAreaEscrita } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Nova máquina — Vanvest' }

export default async function NovaMaquinaPage() {
  await requireAreaEscrita('maquinas')
  const operadores = await listarOperadores()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          render={<Link href="/maquinas" />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Nova máquina</h1>
          <p className="text-muted-foreground text-sm">
            Cadastre uma máquina com código, status e operador.
          </p>
        </div>
      </div>

      <MaquinaForm operadores={operadores} />
    </div>
  )
}
