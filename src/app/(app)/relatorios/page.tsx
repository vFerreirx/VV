import type { Metadata } from 'next'

import { obterRelatorioMensal } from './actions'
import { RelatorioView } from './relatorio-view'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Relatório mensal — Vanvest' }

function mesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireArea('relatorios')

  const sp = await searchParams
  const mesParam = typeof sp.mes === 'string' ? sp.mes : undefined
  const mes =
    mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual()

  const relatorio = await obterRelatorioMensal(mes)

  return <RelatorioView relatorio={relatorio} />
}
