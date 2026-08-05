import type { Metadata } from 'next'

import { listarTarefas } from './actions'
import { TarefasView } from './tarefas-view'
import { listarContasAtivas } from '../contas-marketplace/actions'
import { requireRole } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Tarefas — Vanvest' }

export default async function TarefasPage() {
  // Admin-only e ponto: a área `tarefas` não é editável em /permissoes.
  await requireRole(['admin'])

  const [{ pendentes, concluidas }, contas] = await Promise.all([
    listarTarefas(),
    listarContasAtivas(),
  ])

  return (
    <TarefasView
      pendentes={pendentes}
      concluidas={concluidas}
      // Só o que o seletor precisa.
      contas={contas.map((c) => ({ id: c.id, nome: c.nome }))}
    />
  )
}
