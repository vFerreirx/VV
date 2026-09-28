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
  estacaoOperadores,
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

export type MaquinaDoTeste = { id: string; codigo: string }

export type Elenco = {
  /** Operador ativo numa estação com 3 máquinas livres, e as 3 máquinas. */
  operador: Escolha<{ usuario: AuthUser; estacaoId: string; maquinas: MaquinaDoTeste[] }>
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

export async function escolherElenco(tx: Tx, maquinasPorOperador = 3): Promise<Elenco> {
  return {
    operador: await escolherOperador(tx, maquinasPorOperador),
    gerente: await escolherGerente(tx),
    variacao: await escolherVariacao(tx),
    contaFullMl: await escolherConta(tx),
  }
}

async function escolherOperador(tx: Tx, quantas: number): Promise<Elenco['operador']> {
  const candidatos = await tx
    .select({ usuario: users, estacaoId: estacoes.id })
    .from(users)
    .innerJoin(estacaoOperadores, eq(estacaoOperadores.operadorId, users.id))
    .innerJoin(estacoes, eq(estacoes.id, estacaoOperadores.estacaoId))
    .where(
      and(
        eq(users.role, 'operador'),
        eq(users.ativo, true),
        isNull(users.deletedAt),
        eq(estacoes.ativo, true),
        isNull(estacoes.deletedAt),
      ),
    )
    .orderBy(asc(users.nome))
  if (candidatos.length === 0) {
    return { valor: null, porque: 'nenhum operador ativo ligado a uma estação ativa' }
  }

  const estacaoIds = [...new Set(candidatos.map((c) => c.estacaoId))]
  // LIVRE = viva, não impedida (a mesma `motivoDeImpedimento` que a action
  // usa pra recusar) e sem OP em produção nela.
  const livres = (
    await tx
      .select({
        id: maquinas.id,
        codigo: maquinas.codigo,
        status: maquinas.status,
        estacaoId: maquinas.estacaoId,
      })
      .from(maquinas)
      .where(
        and(
          inArray(maquinas.estacaoId, estacaoIds),
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
      .orderBy(asc(maquinas.codigo))
  ).filter((m) => motivoDeImpedimento(m.status) === null)

  for (const c of candidatos) {
    const daEstacao = livres.filter((m) => m.estacaoId === c.estacaoId)
    if (daEstacao.length >= quantas) {
      return {
        valor: {
          usuario: comoAuth(c.usuario),
          estacaoId: c.estacaoId,
          maquinas: daEstacao
            .slice(0, quantas)
            .map((m) => ({ id: m.id, codigo: m.codigo })),
        },
        porque: null,
      }
    }
  }
  return {
    valor: null,
    porque: `nenhuma estação com operador tem ${quantas} máquinas livres agora`,
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
