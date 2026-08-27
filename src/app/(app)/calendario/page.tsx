import {
  endOfMonth,
  endOfWeek,
  format,
  parse,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { Metadata } from 'next'

import { listarEventosFull, listarOpsComPrazo } from './actions'
import { CalendarioView } from '@/components/calendario/calendario-view'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
import { hojeEmBrasilia } from '@/lib/dia-brasil'

export const metadata: Metadata = { title: 'Calendário — Vanvest' }

// O mês corrente em BRASÍLIA. Com getFullYear/getMonth do servidor (UTC na
// Vercel), às 21h do último dia do mês o calendário já abria no mês seguinte.
function mesAtual(): string {
  return hojeEmBrasilia().slice(0, 7)
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('calendario')
  const podeEditar = podeEscrever(
    await nivelDaAreaPara(user.role, 'calendario'),
  )

  const sp = await searchParams
  const mesParam = typeof sp.mes === 'string' ? sp.mes : undefined
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual()

  // Mês de referência e a grade visível (semanas completas, domingo a sábado).
  const refDate = parse(`${mes}-01`, 'yyyy-MM-dd', new Date())
  const gridStart = startOfWeek(startOfMonth(refDate), { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(refDate), { weekStartsOn: 0 })

  const inicio = format(gridStart, 'yyyy-MM-dd')
  const fim = format(gridEnd, 'yyyy-MM-dd')

  const [eventos, ops] = await Promise.all([
    listarEventosFull(inicio, fim),
    listarOpsComPrazo(inicio, fim),
  ])

  return (
    <CalendarioView
      mes={mes}
      eventos={eventos}
      ops={ops}
      podeEditar={podeEditar}
    />
  )
}
