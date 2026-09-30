// Quem e o quê o teste usa, ESCOLHIDOS NA HORA — nunca IDs fixos. Operadores,
// máquinas e produtos mudam; um ID fixo quebraria o teste no dia em que
// alguém apagasse aquela máquina.
//
// Faltou alguma coisa? O campo volta null com a frase do porquê, e o cenário
// pula os passos que dependem dele (não é falha: o banco pode simplesmente
// não ter uma conta de Full hoje).

import { and, asc, eq, inArray, isNull, notExists, sql } from 'drizzle-orm'

import type { AuthUser } from '@/lib/auth/get-user'
import {
  contasMarketplace,
  estacoes,
  maquinas,
  ordensProducao,
  produtos,
  reposicoesEstoque,
  users,
  variacoesProduto,
  type User,
} from '@/lib/db/schema'
import { motivoDeImpedimento } from '@/lib/producao/estado-maquina'

import type { Tx } from './conexao'

export type Escolha<T> = { valor: T; porque: null } | { valor: null; porque: string }

export type MaquinaDoTeste = { id: string; numero: number }

/**
 * As duas estações do teste. A CASA é a estação do aparelho: o roteiro de
 * 28/09 usa 3 máquinas dela. A de FORA é a que o operador vai cobrir: 1
 * máquina, 'operando', porque é nela que a parada abre e fecha.
 *
 * ⚠️ POR ID, NUNCA POR NOME. Hoje elas se chamam "Tablet 1..4", e o nome é
 * o que o gerente mais muda.
 */
export type EstacoesDoTeste = {
  casa: { id: string; maquinas: MaquinaDoTeste[] }
  fora: { id: string; maquina: MaquinaDoTeste }
}

export type Elenco = {
  /**
   * Um operador ativo QUALQUER. O operador não pertence a estação nenhuma
   * (a estação é do tablet), e `estacao_operadores` é legado que ninguém lê.
   */
  operador: Escolha<AuthUser>
  estacoes: Escolha<EstacoesDoTeste>
  gerente: Escolha<AuthUser>
  variacao: Escolha<{ produtoId: string; variacaoId: string; rotulo: string }>
  contaFullMl: Escolha<{ id: string; nome: string }>
}

function comoAuth(u: User): AuthUser {
  return { ...u, authEmail: u.email }
}

function achou<T>(valor: T | null | undefined, porque: string): Escolha<T> {
  return valor == null ? { valor: null, porque } : { valor, porque: null }
}

export async function escolherElenco(tx: Tx, maquinasDaCasa = 3): Promise<Elenco> {
  return {
    operador: await escolherOperador(tx),
    estacoes: await escolherEstacoes(tx, maquinasDaCasa),
    gerente: await escolherGerente(tx),
    variacao: await escolherVariacao(tx),
    contaFullMl: await escolherConta(tx),
  }
}

async function escolherOperador(tx: Tx): Promise<Elenco['operador']> {
  const [u] = await tx
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, 'operador'),
        eq(users.ativo, true),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.nome))
    .limit(1)
  return achou(u && comoAuth(u), 'nenhum operador ativo')
}

async function escolherEstacoes(
  tx: Tx,
  quantas: number,
): Promise<Elenco['estacoes']> {
  // LIVRE = viva, numa estação viva, não impedida (a mesma
  // `motivoDeImpedimento` que a action usa pra recusar) e sem OP em
  // produção nela.
  const livres = (
    await tx
      .select({
        id: maquinas.id,
        numero: maquinas.numero,
        status: maquinas.status,
        estacaoId: estacoes.id,
      })
      .from(maquinas)
      .innerJoin(
        estacoes,
        and(eq(estacoes.id, maquinas.estacaoId), isNull(estacoes.deletedAt)),
      )
      .where(
        and(
          isNull(maquinas.deletedAt),
          notExists(
            tx
              .select({ um: sql`1` })
              .from(ordensProducao)
              .where(
                and(
                  eq(ordensProducao.maquinaId, maquinas.id),
                  eq(ordensProducao.status, 'em_producao'),
                  isNull(ordensProducao.deletedAt),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(maquinas.numero))
  ).filter((m) => motivoDeImpedimento(m.status) === null)

  const porEstacao = new Map<string, typeof livres>()
  for (const m of livres) {
    porEstacao.set(m.estacaoId, [...(porEstacao.get(m.estacaoId) ?? []), m])
  }
  const so = (m: (typeof livres)[number]) => ({ id: m.id, numero: m.numero })

  // A casa precisa de `quantas` livres; a de fora, de UMA livre e
  // 'operando' — é nela que a parada abre ("manutencao") e fecha.
  for (const [casaId, daCasa] of porEstacao) {
    if (daCasa.length < quantas) continue
    for (const [foraId, daFora] of porEstacao) {
      if (foraId === casaId) continue
      const operando = daFora.find((m) => m.status === 'operando')
      if (!operando) continue
      return {
        valor: {
          casa: { id: casaId, maquinas: daCasa.slice(0, quantas).map(so) },
          fora: { id: foraId, maquina: so(operando) },
        },
        porque: null,
      }
    }
  }
  return {
    valor: null,
    porque:
      `falta uma estação com ${quantas} máquinas livres e OUTRA com uma ` +
      "máquina livre 'operando'",
  }
}

async function escolherGerente(tx: Tx): Promise<Elenco['gerente']> {
  const [u] = await tx
    .select()
    .from(users)
    .where(
      and(
        inArray(users.role, ['gerente_producao', 'admin']),
        eq(users.ativo, true),
        isNull(users.deletedAt),
      ),
    )
    // O gerente antes do admin: o admin passa em tudo e cobriria menos.
    .orderBy(sql`${users.role} = 'admin'`, asc(users.nome))
    .limit(1)
  return achou(u && comoAuth(u), 'nenhum gerente de produção nem admin ativo')
}

async function escolherVariacao(tx: Tx): Promise<Elenco['variacao']> {
  const [v] = await tx
    .select({
      produtoId: produtos.id,
      variacaoId: variacoesProduto.id,
      rotulo: sql<string>`${produtos.nome} || ' · ' || ${variacoesProduto.skuVariacao}`,
    })
    .from(variacoesProduto)
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(
      and(
        eq(produtos.ativo, true),
        isNull(produtos.deletedAt),
        eq(produtos.origem, 'producao'),
        isNull(variacoesProduto.deletedAt),
        // O índice `reposicoes_estoque_variacao_ativa_uidx` só deixa UM item
        // ativo por variação: o do teste não pode colidir com um de verdade.
        notExists(
          tx
            .select({ um: sql`1` })
            .from(reposicoesEstoque)
            .where(
              and(
                eq(reposicoesEstoque.variacaoId, variacoesProduto.id),
                inArray(reposicoesEstoque.estado, [
                  'aberto',
                  'em_producao',
                  'pedido_parceiro',
                ]),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(produtos.nome), asc(variacoesProduto.skuVariacao))
    .limit(1)
  return achou(v, 'nenhuma variação de produto ativo de produção fora da fila de reposição')
}

async function escolherConta(tx: Tx): Promise<Elenco['contaFullMl']> {
  const [c] = await tx
    .select({ id: contasMarketplace.id, nome: contasMarketplace.nome })
    .from(contasMarketplace)
    .where(
      and(
        eq(contasMarketplace.canal, 'full_ml'),
        eq(contasMarketplace.ativo, true),
        isNull(contasMarketplace.deletedAt),
      ),
    )
    .orderBy(asc(contasMarketplace.nome))
    .limit(1)
  return achou(c, 'nenhuma conta de Full ML ativa')
}
