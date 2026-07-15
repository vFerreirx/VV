import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { listarCores } from '../cores/actions'
import { listarModelos } from '../modelos/actions'
import { listarTamanhos } from '../tamanhos/actions'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Variações — Vanvest' }

// DEBUG TEMPORÁRIO: não renderiza o VariacoesTabs (client boundary). Busca
// os dados e serializa aqui dentro do try/catch pra capturar o erro real
// (produção esconde do cliente) e mostrar os dados crus pra inspeção.
export default async function VariacoesPage() {
  let dump: string
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
    if (!verCores && !verModelos && !verTamanhos) redirect('/dashboard')

    const [cores, modelos, tamanhos] = await Promise.all([
      verCores ? listarCores() : Promise.resolve([]),
      verModelos ? listarModelos() : Promise.resolve([]),
      verTamanhos ? listarTamanhos() : Promise.resolve([]),
    ])

    dump =
      'DEBUG /variacoes — dados (sem client boundary):\n\n' +
      JSON.stringify(
        { cores, modelos, tamanhos },
        (_k, v) => {
          if (typeof v === 'bigint') return `<<BIGINT ${v}>>`
          if (typeof v === 'function') return '<<FUNCTION>>'
          if (typeof v === 'symbol') return '<<SYMBOL>>'
          if (
            typeof v === 'object' &&
            v !== null &&
            v.constructor?.name &&
            !['Object', 'Array', 'Date'].includes(v.constructor.name)
          )
            return `<<${v.constructor.name}>>`
          return v
        },
        2,
      )
  } catch (err) {
    const digest = (err as { digest?: unknown })?.digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_')) throw err
    dump =
      'DEBUG /variacoes — erro no fetch/serialização:\n\n' +
      (err instanceof Error ? (err.stack ?? err.message) : String(err))
  }

  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        padding: 20,
        fontSize: 11,
        fontFamily: 'monospace',
      }}
    >
      {dump}
    </pre>
  )
}
