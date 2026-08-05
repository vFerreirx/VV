import type { Metadata } from 'next'

import { listarEmpresas } from './actions'
import { EmpresasList } from './empresas-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Empresas — Vanvest' }

export default async function EmpresasPage() {
  const user = await requireArea('empresas')
  const nivel = await nivelDaAreaPara(user.role, 'empresas')
  const podeEditar = podeEscrever(nivel)

  const empresas = await listarEmpresas()

  return <EmpresasList empresas={empresas} podeEditar={podeEditar} />
}
