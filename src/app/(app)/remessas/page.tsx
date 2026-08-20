import type { Metadata } from 'next'

import { listarOpsDasRemessas, listarRemessasAbertas, listarRemessasSemOp } from './actions'
import { RemessasView } from './remessas-view'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Remessas Full — Vanvest' }

export default async function RemessasPage() {
  const user = await requireArea('remessas')

  const [remessas, semOp] = await Promise.all([listarRemessasAbertas(), listarRemessasSemOp()])
  const ops = await listarOpsDasRemessas(remessas.map((r) => r.id))
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'remessas'))

  return <RemessasView remessas={remessas} ops={ops} semOp={semOp} podeEditar={podeEditar} />
}
