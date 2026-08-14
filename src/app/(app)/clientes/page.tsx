import type { Metadata } from 'next'

import { listarCompradores } from './actions'
import { CompradoresList } from './compradores-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Clientes — Vanvest' }

export default async function ClientesPage() {
  const user = await requireArea('compradores')
  const nivel = await nivelDaAreaPara(user.role, 'compradores')
  const podeEditar = podeEscrever(nivel)

  const compradores = await listarCompradores()

  return <CompradoresList compradores={compradores} podeEditar={podeEditar} />
}
