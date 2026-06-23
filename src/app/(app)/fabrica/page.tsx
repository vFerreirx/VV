import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { listarMaquinas } from '../maquinas/actions'
import {
  listarEstacoes,
  listarMaquinasOpcoes,
  listarOperadores,
  type EstacaoComDetalhes,
  type MaquinaOpcao,
  type OperadorOpcao,
} from '../estacoes/actions'
import { FabricaTabs } from './fabrica-tabs'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { isManager, requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Fábrica — Vanvest' }

export default async function FabricaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireAuth()

  const [nMaq, nEst] = await Promise.all([
    nivelDaAreaPara(user.role, 'maquinas'),
    nivelDaAreaPara(user.role, 'estacoes'),
  ])
  const verMaquinas = nMaq !== 'nenhum'
  // Estações é gerencial (as actions exigem admin/gerente), então só
  // aparece pra quem é gerente/admin e tem a área liberada.
  const verEstacoes = nEst !== 'nenhum' && isManager(user.role)
  if (!verMaquinas && !verEstacoes) redirect('/dashboard')

  const maquinas = verMaquinas ? await listarMaquinas() : []

  let estacoes: EstacaoComDetalhes[] = []
  let operadores: OperadorOpcao[] = []
  let maquinasOpcoes: MaquinaOpcao[] = []
  if (verEstacoes) {
    ;[estacoes, operadores, maquinasOpcoes] = await Promise.all([
      listarEstacoes(),
      listarOperadores(),
      listarMaquinasOpcoes(),
    ])
  }

  const sp = await searchParams
  const tabInicial = typeof sp.tab === 'string' ? sp.tab : 'maquinas'

  return (
    <FabricaTabs
      tabInicial={tabInicial}
      verMaquinas={verMaquinas}
      verEstacoes={verEstacoes}
      maquinas={maquinas}
      podeEditarMaquinas={isManager(user.role)}
      estacoes={estacoes}
      operadores={operadores}
      maquinasOpcoes={maquinasOpcoes}
    />
  )
}
