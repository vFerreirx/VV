import type { Metadata } from 'next'

import { listarVendasRecentes, obterVendaDoDia } from './actions'
import { VendasTabs } from './vendas-tabs'
import { obterRelatorioMensal } from '../relatorios/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Vendas — Vanvest' }

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mesAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('vendas')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))

  const sp = await searchParams
  const dataParam =
    typeof sp.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.data)
      ? sp.data
      : undefined
  const mesParam = typeof sp.mes === 'string' ? sp.mes : undefined
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtual()
  const tabInicial = sp.tab === 'mensal' ? 'mensal' : 'diario'

  // Sem ?data na URL, abre no ÚLTIMO dia com vendas lançadas (recentes vem
  // ordenado por data desc); se nunca houve venda, cai pra hoje.
  const recentes = await listarVendasRecentes()
  const data = dataParam ?? recentes[0]?.data ?? hojeISO()

  const [vendaDoDia, relatorio] = await Promise.all([
    obterVendaDoDia(data),
    obterRelatorioMensal(mes),
  ])

  return (
    <VendasTabs
      tabInicial={tabInicial}
      data={data}
      vendaDoDia={vendaDoDia}
      recentes={recentes}
      podeEditar={podeEditar}
      relatorio={relatorio}
    />
  )
}
