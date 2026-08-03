import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { listarProdutosParaOrdem } from '../actions'
import { listarRemessasFull } from '../remessas-actions'
import { listarKitsComItens } from '../../kits/actions'
import { ImportarFullView } from './importar-full-view'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Importar Full — Vanvest' }

export default async function ImportarFullPage() {
  const user = await requireArea('ordens')
  // A importação CRIA OPs, então quem só tem 'ver' na área não entra —
  // a tela inteira é uma ação de escrita.
  if (!podeEscrever(await nivelDaAreaPara(user.role, 'ordens'))) {
    redirect('/ordens')
  }

  const [remessas, kits, produtos] = await Promise.all([
    listarRemessasFull(),
    listarKitsComItens(),
    listarProdutosParaOrdem(),
  ])

  return <ImportarFullView remessas={remessas} kits={kits} produtos={produtos} />
}
