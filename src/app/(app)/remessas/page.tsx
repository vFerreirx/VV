import type { Metadata } from 'next'

import {
  listarOpsDasRemessas,
  listarRemessasAbertas,
  listarRemessasDespachadas,
  listarRemessasSemOp,
} from './actions'
import { RemessasView } from './remessas-view'
import { listarContasAtivas } from '../contas-marketplace/actions'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { isManager, requireArea } from '@/lib/auth/require-auth'

export const metadata: Metadata = { title: 'Remessas Full — Vanvest' }

export default async function RemessasPage() {
  const user = await requireArea('remessas')

  const [nivelRemessas, nivelOrdens, nivelKanban] = await Promise.all([
    nivelDaAreaPara(user.role, 'remessas'),
    nivelDaAreaPara(user.role, 'ordens'),
    nivelDaAreaPara(user.role, 'kanban'),
  ])
  // Editar e Despachar: escrita em Remessas.
  const podeEditar = podeEscrever(nivelRemessas)

  const [remessas, despachadas, semOp, contas] = await Promise.all([
    listarRemessasAbertas(),
    listarRemessasDespachadas(),
    listarRemessasSemOp(),
    podeEditar ? listarContasAtivas() : Promise.resolve([]),
  ])
  const ops = await listarOpsDasRemessas(remessas.map((r) => r.id))

  return (
    <RemessasView
      remessas={remessas}
      despachadas={despachadas}
      ops={ops}
      semOp={semOp}
      podeEditar={podeEditar}
      contas={contas}
      // O painel lateral da OP segue as mesmas permissões do kanban e da
      // /ordens: ações de produção pelo kanban, cancelar/excluir/mudar destino
      // por ordens.
      gestor={isManager(user.role)}
      podeMoverKanban={podeEscrever(nivelKanban)}
      podeEditarOrdens={podeEscrever(nivelOrdens)}
    />
  )
}
