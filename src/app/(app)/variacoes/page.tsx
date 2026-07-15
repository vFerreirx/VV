import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { listarCores } from '../cores/actions'
import { CoresList } from '../cores/cores-list'
import { listarModelos } from '../modelos/actions'
import { ModelosList } from '../modelos/modelos-list'
import { listarTamanhos } from '../tamanhos/actions'
import { TamanhosList } from '../tamanhos/tamanhos-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Variações — Vanvest' }

// DEBUG TEMPORÁRIO: renderiza as três listas EMPILHADAS, sem o <Tabs>.
// Se carregar, o culpado do crash é o componente Tabs (base-ui) no SSR.
export default async function VariacoesPage() {
  const user = await requireAuth()

  const [nCores, nModelos, nTamanhos] = await Promise.all([
    nivelDaAreaPara(user.role, 'cores'),
    nivelDaAreaPara(user.role, 'modelos'),
    nivelDaAreaPara(user.role, 'tamanhos'),
  ])
  const verCores = nCores !== 'nenhum'
  const verModelos = nModelos !== 'nenhum'
  const verTamanhos = nTamanhos !== 'nenhum'
  if (!verCores && !verModelos && !verTamanhos) redirect('/dashboard')

  const [cores, modelos, tamanhos] = await Promise.all([
    verCores ? listarCores() : Promise.resolve([]),
    verModelos ? listarModelos() : Promise.resolve([]),
    verTamanhos ? listarTamanhos() : Promise.resolve([]),
  ])

  return (
    <div className="space-y-8 p-4">
      <p>DEBUG: listas sem Tabs</p>
      <section>
        <h2>Cores</h2>
        <CoresList cores={cores} podeEditar={podeEscrever(nCores)} />
      </section>
      <section>
        <h2>Modelos</h2>
        <ModelosList modelos={modelos} podeEditar={podeEscrever(nModelos)} />
      </section>
      <section>
        <h2>Tamanhos</h2>
        <TamanhosList tamanhos={tamanhos} podeEditar={podeEscrever(nTamanhos)} />
      </section>
    </div>
  )
}
