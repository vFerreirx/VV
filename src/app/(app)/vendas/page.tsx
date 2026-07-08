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

  // Comparação MANUAL: só quando o usuário escolhe o período B (?cde/?cate).
  let inicioComp = isData(sp.cde) ? sp.cde : null
  let fimComp = isData(sp.cate) ? sp.cate : null
  if (inicioComp && fimComp && inicioComp > fimComp) {
    ;[inicioComp, fimComp] = [fimComp, inicioComp]
  }

  const [vendaDoDia, relatorio, comparacao] = await Promise.all([
    obterVendaDoDia(data),
    obterRelatorioPeriodo(inicio, fim),
    inicioComp && fimComp
      ? obterRelatorioPeriodo(inicioComp, fimComp)
      : Promise.resolve(null),
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
