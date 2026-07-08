import type { Metadata } from 'next'

import { listarVendasRecentes, obterVendaDoDia } from './actions'
import { VendasTabs } from './vendas-tabs'
import { obterRelatorioPeriodo } from '../relatorios/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Vendas — Vanvest' }

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isData = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

// Soma n dias a um YYYY-MM-DD (UTC meio-dia, sem fuso).
function addDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// Período de comparação:
// - período dentro de UM mês -> mesmos dias do mês anterior (1–25/07 vs
//   1–25/06), com o dia final ajustado se o mês anterior for mais curto;
// - período cruzando meses (ex.: últimos 30 dias) -> janela imediatamente
//   anterior com o mesmo tamanho.
function periodoComparacao(inicio: string, fim: string): [string, string] {
  const mesmoMes = inicio.slice(0, 7) === fim.slice(0, 7)
  if (mesmoMes) {
    const [y, m] = inicio.split('-').map(Number)
    const yAnt = m === 1 ? y - 1 : y
    const mAnt = m === 1 ? 12 : m - 1
    const ultimoDiaAnt = new Date(Date.UTC(yAnt, mAnt, 0)).getUTCDate()
    const diaIni = Math.min(Number(inicio.slice(8, 10)), ultimoDiaAnt)
    const diaFim = Math.min(Number(fim.slice(8, 10)), ultimoDiaAnt)
    const mm = String(mAnt).padStart(2, '0')
    return [
      `${yAnt}-${mm}-${String(diaIni).padStart(2, '0')}`,
      `${yAnt}-${mm}-${String(diaFim).padStart(2, '0')}`,
    ]
  }
  const dias =
    Math.round(
      (Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) /
        86_400_000,
    ) + 1
  const fimComp = addDias(inicio, -1)
  return [addDias(fimComp, -(dias - 1)), fimComp]
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireArea('vendas')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))

  const sp = await searchParams
  const dataParam = isData(sp.data) ? sp.data : undefined
  const tabInicial = sp.tab === 'mensal' ? 'mensal' : 'diario'

  // Período do relatório (De/Até). Padrão: mês atual (dia 1 -> hoje).
  const hoje = hojeISO()
  let inicio = isData(sp.de) ? sp.de : `${hoje.slice(0, 7)}-01`
  let fim = isData(sp.ate) ? sp.ate : hoje
  if (inicio > fim) [inicio, fim] = [fim, inicio]

  // Sem ?data na URL, abre no ÚLTIMO dia com vendas lançadas (recentes vem
  // ordenado por data desc); se nunca houve venda, cai pra hoje.
  const recentes = await listarVendasRecentes()
  const data = dataParam ?? recentes[0]?.data ?? hoje

  const [inicioComp, fimComp] = periodoComparacao(inicio, fim)
  const [vendaDoDia, relatorio, comparacao] = await Promise.all([
    obterVendaDoDia(data),
    obterRelatorioPeriodo(inicio, fim),
    obterRelatorioPeriodo(inicioComp, fimComp),
  ])

  return (
    <VendasTabs
      tabInicial={tabInicial}
      data={data}
      vendaDoDia={vendaDoDia}
      recentes={recentes}
      podeEditar={podeEditar}
      relatorio={relatorio}
      comparacao={comparacao}
    />
  )
}
