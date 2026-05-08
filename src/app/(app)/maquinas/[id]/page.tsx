import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { listarOperadores, obterMaquina } from '../actions'
import {
  MaquinaForm,
  type MaquinaFormDefaults,
} from '@/components/forms/maquina-form'
import { Button } from '@/components/ui/button'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Editar máquina — Malharia MVP' }

export default async function EditarMaquinaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(['admin', 'gerente_producao'])
  const { id } = await params

  const [maquina, operadores] = await Promise.all([
    obterMaquina(id),
    listarOperadores(),
  ])
  if (!maquina) notFound()

  const defaults: MaquinaFormDefaults = {
    id: maquina.id,
    codigo: maquina.codigo,
    nome: maquina.nome,
    tipo: maquina.tipo,
    status: maquina.status,
    diametroPolegadas: maquina.diametroPolegadas,
    finura: maquina.finura,
    numAlimentadores: maquina.numAlimentadores,
    capacidadeKgPorHora: maquina.capacidadeKgPorHora,
    operadorAtualId: maquina.operadorAtualId,
    ultimaManutencao: maquina.ultimaManutencao,
    proximaManutencao: maquina.proximaManutencao,
    observacoes: maquina.observacoes,
  }

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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">
            {maquina.codigo} — {maquina.nome}
          </h1>
        </div>
      </div>

      <MaquinaForm defaults={defaults} operadores={operadores} />
    </div>
  )
}
