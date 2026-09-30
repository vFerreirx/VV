import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { obterMaquina } from '../actions'
import {
  MaquinaForm,
  type MaquinaFormDefaults,
} from '@/components/forms/maquina-form'
import { Button } from '@/components/ui/button'
import { requireAreaEscrita } from '@/lib/auth/require-auth'
import { nomeDaMaquina } from '@/lib/producao/nome-da-maquina'

export const metadata: Metadata = { title: 'Editar máquina — Vanvest' }

export default async function EditarMaquinaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAreaEscrita('maquinas')
  const { id } = await params

  const maquina = await obterMaquina(id)
  if (!maquina) notFound()

  const defaults: MaquinaFormDefaults = {
    id: maquina.id,
    numero: maquina.numero,
    status: maquina.status,
    observacoes: maquina.observacoes,
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          render={<Link href="/fabrica" />}
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{nomeDaMaquina(maquina.numero)}</h1>
        </div>
      </div>

      <MaquinaForm defaults={defaults} />
    </div>
  )
}
