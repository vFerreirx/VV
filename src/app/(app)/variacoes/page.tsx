import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { listarCores } from '../cores/actions'
import { listarModelos } from '../modelos/actions'
import { listarTamanhos } from '../tamanhos/actions'
import { VariacoesTabs } from './variacoes-tabs'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Variações — Vanvest' }

export default async function VariacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  let props: Parameters<typeof VariacoesTabs>[0]
  try {
    const user = await requireAuth()

    const [nCores, nModelos, nTamanhos] = await Promise.all([
      nivelDaAreaPara(user.role, 'cores'),
      nivelDaAreaPara(user.role, 'modelos'),
      nivelDaAreaPara(user.role, 'tamanhos'),
    ])
    const verCores = nCores !== 'nenhum'
    const verModelos = nModelos !== 'nenhum'
    const verTamanhos = nTamanhos !== 'nenhum'
    // Sem acesso a nenhuma das três sub-áreas → volta pro dashboard.
    if (!verCores && !verModelos && !verTamanhos) redirect('/dashboard')

    const [cores, modelos, tamanhos] = await Promise.all([
      verCores ? listarCores() : Promise.resolve([]),
      verModelos ? listarModelos() : Promise.resolve([]),
      verTamanhos ? listarTamanhos() : Promise.resolve([]),
    ])

    const sp = await searchParams
    const tabInicial = typeof sp.tab === 'string' ? sp.tab : 'cores'

    props = {
      tabInicial,
      cores,
      modelos,
      tamanhos,
      acessoCores: { ver: verCores, editar: podeEscrever(nCores) },
      acessoModelos: { ver: verModelos, editar: podeEscrever(nModelos) },
      acessoTamanhos: { ver: verTamanhos, editar: podeEscrever(nTamanhos) },
    }
  } catch (err) {
    // DEBUG TEMPORÁRIO: control-flow do Next (redirect/notFound) tem que
    // continuar borbulhando; qualquer outro erro (auth/fetch) é mostrado na
    // tela pra capturar o stack real que a produção esconde do cliente.
    const digest = (err as { digest?: unknown })?.digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw err
    const detalhe =
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    return (
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          padding: 20,
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        {'DEBUG /variacoes — erro no fetch/auth server:\n\n' + detalhe}
      </pre>
    )
  }

  return <VariacoesTabs {...props} />
}
