import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { listarMaquinas } from '../maquinas/actions'
import {
  listarEstacoes,
  listarMaquinasOpcoes,
  listarOperadores,
  type EstacaoComDetalhes,
  type MaquinaOpcao,
  type OperadorOpcao,
} from '../estacoes/actions'
import { FabricaTabs, type PendenciasDaFabrica } from './fabrica-tabs'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { isManager, requireAuth } from '@/lib/auth/require-auth'
import { podeEscrever } from '@/lib/auth/permissoes'

export const metadata: Metadata = { title: 'Fábrica — Vanvest' }

export default async function FabricaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireAuth()

  const [nMaq, nEst, nOrdens, nKanban] = await Promise.all([
    nivelDaAreaPara(user.role, 'maquinas'),
    nivelDaAreaPara(user.role, 'estacoes'),
    // Decide se o número da OP no cartão abre a ficha dela.
    nivelDaAreaPara(user.role, 'ordens'),
    // E o que a ficha deixa fazer: sem escrita no kanban, só leitura.
    nivelDaAreaPara(user.role, 'kanban'),
  ])
  const verMaquinas = nMaq !== 'nenhum'
  const verEstacoes = nEst !== 'nenhum'
  if (!verMaquinas && !verEstacoes) redirect('/dashboard')

  // ⚠️ O OPERADOR NÃO É PÚBLICO DESTA TELA. Ele registra parada no tablet da
  // estação (/producao), com a trava de PIN dizendo quem tocou; aqui, parar e
  // liberar máquina é da gerência, pela escrita na área `maquinas`. O padrão
  // do operador nessa área é `nenhum` (src/lib/auth/permissoes.ts) — e
  // `trocarStatusAction` continua aceitando o operador da estação, porque é
  // a mesma action que o tablet chama.
  //
  // TUDO EM PARALELO: a tela recarrega a cada mudança de OP ou de máquina, e
  // as máquinas em série antes das estações seguravam a conexão pela soma.
  const vazio = Promise.resolve([])
  const [maquinas, estacoes, operadores, maquinasOpcoes]: [
    Awaited<ReturnType<typeof listarMaquinas>>,
    EstacaoComDetalhes[],
    OperadorOpcao[],
    MaquinaOpcao[],
  ] = await Promise.all([
    verMaquinas ? listarMaquinas() : vazio,
    verEstacoes ? listarEstacoes() : vazio,
    verEstacoes ? listarOperadores() : vazio,
    verEstacoes ? listarMaquinasOpcoes() : vazio,
  ])

  // O PASSO 2, só pra quem monta as estações. As listas já vieram acima; o
  // PIN chega como booleano (`temPin`), nunca o hash.
  //
  // ⚠️ "SEM OPERADOR" CONTA OPERADOR ATIVO, e por isso sai de `operadores` e
  // não de `estacoes[].operadores`. Aquela lista só descarta usuário
  // EXCLUÍDO: um operador desativado ainda vinculado faria a estação parecer
  // atendida sem ninguém conseguir entrar no tablet dela.
  const pendencias: PendenciasDaFabrica | null = podeEscrever(nEst)
    ? {
        nenhumOperadorAtivo: operadores.length === 0,
        estacoesSemOperador: estacoes
          .filter((e) => !operadores.some((o) => o.estacaoAtualId === e.id))
          .map((e) => e.nome),
        maquinasSemEstacao: maquinasOpcoes
          .filter((m) => m.estacaoId === null)
          .map((m) => m.codigo),
        operadoresSemPin: operadores
          .filter((o) => o.estacaoAtualId !== null && !o.temPin)
          .map((o) => o.nome),
      }
    : null

  const sp = await searchParams
  const tabInicial = typeof sp.tab === 'string' ? sp.tab : 'maquinas'

  return (
    <FabricaTabs
      tabInicial={tabInicial}
      verMaquinas={verMaquinas}
      verEstacoes={verEstacoes}
      maquinas={maquinas}
      podeEditarMaquinas={podeEscrever(nMaq)}
      podeVerOrdens={nOrdens !== 'nenhum'}
      fichaDaOp={
        podeEscrever(nKanban)
          ? {
              gestor: isManager(user.role),
              podeMover: true,
              podeEditarOrdens: podeEscrever(nOrdens),
            }
          : { gestor: false, podeMover: false, podeEditarOrdens: false }
      }
      pendencias={pendencias}
      // /usuarios é `requireRole(['admin'])`: pro gerente, um link pra lá
      // terminaria em redirect.
      podeCriarUsuario={user.role === 'admin'}
      estacoes={estacoes}
      operadores={operadores}
      maquinasOpcoes={maquinasOpcoes}
      // Limpar PIN é operação de chão de fábrica: admin e gerente. A action
      // confere de novo do lado dela.
      podeLimparPin={isManager(user.role)}
    />
  )
}
