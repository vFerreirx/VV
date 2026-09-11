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
import { estacaoDoOperador } from '@/lib/db/estacao-operadores'
import { requireAuth } from '@/lib/auth/require-auth'
import { podeEscrever } from '@/lib/auth/permissoes'

export const metadata: Metadata = { title: 'Fábrica — Vanvest' }

export default async function FabricaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireAuth()

  const [nMaq, nEst, nOrdens] = await Promise.all([
    nivelDaAreaPara(user.role, 'maquinas'),
    nivelDaAreaPara(user.role, 'estacoes'),
    // Decide se o cartão da máquina mostra o link pro detalhe da OP. A rota
    // /ordens tem `requireArea('ordens')`, então oferecer o link a quem não
    // tem a área terminaria em redirect.
    nivelDaAreaPara(user.role, 'ordens'),
  ])
  const verMaquinas = nMaq !== 'nenhum'
  const verEstacoes = nEst !== 'nenhum'
  if (!verMaquinas && !verEstacoes) redirect('/dashboard')

  const maquinas = verMaquinas ? await listarMaquinas() : []

  // ⚠️ A ESTAÇÃO DO OPERADOR, e é ela que libera o botão de Manutenção nas
  // máquinas dele. A tela precisa fazer a MESMA conta que `trocarStatusAction`
  // já faz no servidor: gerência pelo nível da área, operador pela estação.
  // Enquanto o cartão olhava só `podeEscrever`, o operador — que em produção
  // está como `ver` — não via o botão de uma ação que a action aceitaria dele.
  // Tela que promete menos do que a action entrega é a mesma classe de
  // problema que promete mais: as duas fazem alguém desistir de uma coisa que
  // dava pra fazer, ou tentar uma que não dava.
  const estacaoDoOp =
    user.role === 'operador' ? await estacaoDoOperador(user.id) : null

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
      podeEditarMaquinas={podeEscrever(nMaq)}
      estacaoDoOperadorId={estacaoDoOp?.id ?? null}
      podeVerOrdens={nOrdens !== 'nenhum'}
      estacoes={estacoes}
      operadores={operadores}
      maquinasOpcoes={maquinasOpcoes}
    />
  )
}
