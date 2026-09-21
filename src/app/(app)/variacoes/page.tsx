import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { listarCores } from '../cores/actions'
import { listarModelos } from '../modelos/actions'
import { listarTamanhos } from '../tamanhos/actions'
import { VariacoesTabs } from './variacoes-tabs'
import { podeEscrever } from '@/lib/auth/permissoes'
import {
  usoDeCoresNasVariacoes,
  usoDeModelosNasVariacoes,
  usoDeTamanhosNasVariacoes,
} from '@/lib/db/uso-do-catalogo'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Variações — Vanvest' }

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
  // Sem acesso a nenhuma das três sub-áreas → volta pro dashboard.
  if (!verCores && !verModelos && !verTamanhos) redirect('/dashboard')

  // EM QUANTAS VARIAÇÕES CADA UM É USADO. Uma consulta agregada por aba, e
  // só pra aba que o cargo enxerga — o contador é o que responde "posso
  // apagar isto?" sem abrir produto por produto.
  const [cores, modelos, tamanhos, usoCores, usoModelos, usoTamanhos] =
    await Promise.all([
      verCores ? listarCores() : Promise.resolve([]),
      verModelos ? listarModelos() : Promise.resolve([]),
      verTamanhos ? listarTamanhos() : Promise.resolve([]),
      verCores ? usoDeCoresNasVariacoes() : Promise.resolve(new Map()),
      verModelos ? usoDeModelosNasVariacoes() : Promise.resolve(new Map()),
      verTamanhos ? usoDeTamanhosNasVariacoes() : Promise.resolve(new Map()),
    ])

  // Map não atravessa a fronteira server→client: vira objeto simples aqui.
  const objeto = (m: Map<string, { variacoes: number; produtos: number }>) =>
    Object.fromEntries(m)

  const sp = await searchParams
  const tabInicial = typeof sp.tab === 'string' ? sp.tab : 'cores'

  return (
    <VariacoesTabs
      tabInicial={tabInicial}
      cores={cores}
      modelos={modelos}
      tamanhos={tamanhos}
      usoCores={objeto(usoCores)}
      usoModelos={objeto(usoModelos)}
      usoTamanhos={objeto(usoTamanhos)}
      acessoCores={{ ver: verCores, editar: podeEscrever(nCores) }}
      acessoModelos={{ ver: verModelos, editar: podeEscrever(nModelos) }}
      acessoTamanhos={{ ver: verTamanhos, editar: podeEscrever(nTamanhos) }}
    />
  )
}
