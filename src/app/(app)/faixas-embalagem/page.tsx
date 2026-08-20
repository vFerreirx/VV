import type { Metadata } from 'next'

import { listarFaixasEmbalagem } from './actions'
import { FaixasList } from './faixas-list'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Faixas de embalagem — Vanvest' }

export default async function FaixasEmbalagemPage() {
  const user = await requireArea('faixasEmbalagem')
  const podeEditar = podeEscrever(await nivelDaAreaPara(user.role, 'faixasEmbalagem'))
  const faixas = await listarFaixasEmbalagem()

  return (
    <FaixasList
      faixas={faixas.map((f) => ({
        id: f.id,
        pesoAteGramas: f.pesoAteGramas,
        alturaCm: Number(f.alturaCm),
        larguraCm: Number(f.larguraCm),
        comprimentoCm: Number(f.comprimentoCm),
      }))}
      podeEditar={podeEditar}
    />
  )
}
