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

// DEBUG TEMPORÁRIO: passa os dados como objetos PLANOS (JSON round-trip
// converte Date → string). Se o Vercel carregar, o problema era serializar
// os objetos Date/Drizzle crus no boundary RSC.
function plano<T>(rows: T): T {
  return JSON.parse(JSON.stringify(rows)) as T
}

export default async function VariacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
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

  const sp = await searchParams
  const tabInicial = typeof sp.tab === 'string' ? sp.tab : 'cores'

  return (
    <VariacoesTabs
      tabInicial={tabInicial}
      cores={plano(cores)}
      modelos={plano(modelos)}
      tamanhos={plano(tamanhos)}
      acessoCores={{ ver: verCores, editar: podeEscrever(nCores) }}
      acessoModelos={{ ver: verModelos, editar: podeEscrever(nModelos) }}
      acessoTamanhos={{ ver: verTamanhos, editar: podeEscrever(nTamanhos) }}
    />
  )
}
