import type { Metadata } from 'next'

import { listarOpsDasRemessas, listarRemessasAbertas } from './actions'
import { RemessasView } from './remessas-view'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Remessas Full — Vanvest' }

export default async function RemessasPage() {
  await requireArea('remessas')

  const remessas = await listarRemessasAbertas()
  const ops = await listarOpsDasRemessas(remessas.map((r) => r.id))

  return <RemessasView remessas={remessas} ops={ops} />
}
