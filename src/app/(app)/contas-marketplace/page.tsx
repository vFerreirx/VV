import type { Metadata } from 'next'

import { listarEmpresasParaSelecao } from '../empresas/actions'
import { listarContas } from './actions'
import { ContasList } from './contas-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'
import { nomeDaEmpresa } from '@/lib/validators/empresas'

export const metadata: Metadata = { title: 'Contas de marketplace — Vanvest' }

export default async function ContasMarketplacePage() {
  const user = await requireArea('contasMarketplace')
  const nivel = await nivelDaAreaPara(user.role, 'contasMarketplace')
  const podeEditar = podeEscrever(nivel)

  const [contas, empresas] = await Promise.all([
    listarContas(),
    listarEmpresasParaSelecao(),
  ])

  return (
    <ContasList
      contas={contas}
      // Só o que o seletor precisa — o resto do cadastro não atravessa
      // pro cliente.
      empresas={empresas.map((e) => ({ id: e.id, nome: nomeDaEmpresa(e) }))}
      podeEditar={podeEditar}
    />
  )
}
