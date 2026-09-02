import 'server-only'

import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  estacaoOperadores,
  estacoes,
  maquinas,
  ordensProducao,
  users,
} from '@/lib/db/schema'

// Quem é de qual estação.
//
// Uma estação tem ATÉ 3 operadores (o limite é do Zod, não do banco) e um
// operador pertence a UMA estação — essa metade da regra é do banco, via
// `UNIQUE (operador_id)` na migration 50. É dela que sai o singular de
// `estacaoDoOperador`: a consulta pode devolver no máximo uma linha, e é por
// isso que o kanban pode juntar OP -> responsável -> estação sem duplicar
// card.
//
// ⚠️ Tanto `estacoes` quanto `users` usam SOFT DELETE, então o ON DELETE
// CASCADE da tabela quase nunca dispara — apagar na tela é UPDATE. Toda
// leitura aqui filtra `deleted_at IS NULL` dos dois lados, e quem apaga o
// vínculo de verdade é `excluirEstacaoAction`. Sem isso um operador ficaria
// preso a uma estação fantasma e o UNIQUE nunca deixaria ele entrar noutra.

export type EstacaoDoOperador = { id: string; nome: string; cor: string | null }

/** A estação viva do operador, ou null se ele não está em nenhuma. */
export async function estacaoDoOperador(
  operadorId: string,
): Promise<EstacaoDoOperador | null> {
  const [row] = await db
    .select({ id: estacoes.id, nome: estacoes.nome, cor: estacoes.cor })
    .from(estacaoOperadores)
    .innerJoin(estacoes, eq(estacoes.id, estacaoOperadores.estacaoId))
    .where(
      and(
        eq(estacaoOperadores.operadorId, operadorId),
        isNull(estacoes.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export type OperadorDaEstacao = { id: string; nome: string }

/**
 * Operadores de várias estações de uma vez, agrupados por estacaoId.
 * Uma consulta pra lista inteira — nada de N+1.
 */
export async function operadoresPorEstacao(
  estacaoIds: string[],
): Promise<Map<string, OperadorDaEstacao[]>> {
  const mapa = new Map<string, OperadorDaEstacao[]>()
  if (estacaoIds.length === 0) return mapa

  const rows = await db
    .select({
      estacaoId: estacaoOperadores.estacaoId,
      id: users.id,
      nome: users.nome,
    })
    .from(estacaoOperadores)
    .innerJoin(users, eq(users.id, estacaoOperadores.operadorId))
    .where(
      and(
        inArray(estacaoOperadores.estacaoId, estacaoIds),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.nome))

  for (const r of rows) {
    const lista = mapa.get(r.estacaoId) ?? []
    lista.push({ id: r.id, nome: r.nome })
    mapa.set(r.estacaoId, lista)
  }
  return mapa
}

export type VinculoDeOperador = {
  operadorId: string
  estacaoId: string
  estacaoNome: string
}

/**
 * Em que estação VIVA cada um destes operadores já está. Serve pra recusar
 * com "Fulano já está na estação X" antes de o UNIQUE do banco estourar com
 * erro cru na cara do usuário.
 */
export async function vinculosDeOperadores(
  operadorIds: string[],
): Promise<VinculoDeOperador[]> {
  if (operadorIds.length === 0) return []
  return db
    .select({
      operadorId: estacaoOperadores.operadorId,
      estacaoId: estacoes.id,
      estacaoNome: estacoes.nome,
    })
    .from(estacaoOperadores)
    .innerJoin(estacoes, eq(estacoes.id, estacaoOperadores.estacaoId))
    .where(
      and(
        inArray(estacaoOperadores.operadorId, operadorIds),
        isNull(estacoes.deletedAt),
      ),
    )
}

// -----------------------------------------------------------------
// A regra de VISÃO do operador
// -----------------------------------------------------------------
// O operador enxerga:
//   (a) toda OP SEM MÁQUINA — a fila comum, onde ficam 'programado' e
//       'aguardando_materia_prima'; e
//   (b) toda OP cuja máquina pertence à estação dele, em QUALQUER status,
//       inclusive as que o colega pegou.
// Admin e gerente_producao não passam por aqui — veem tudo, sem filtro.
//
// ⚠️ Isto é um WHERE, nunca um JOIN, e a diferença não é estilo: join com
// `estacao_operadores` multiplicaria a linha da OP por operador da estação e
// o card apareceria duplicado no board. Where filtra sem multiplicar.
//
// ⚠️ E roda no SERVIDOR. Filtrar no cliente mandaria a fábrica inteira pro
// navegador do operador e só esconderia — isso é vazamento, não filtro.
export async function condicaoDeVisaoDoOperador(
  operadorId: string,
): Promise<SQL> {
  const estacao = await estacaoDoOperador(operadorId)
  return or(
    isNull(ordensProducao.maquinaId),
    // Operador sem estação enxerga só a fila. Ele também não consegue pegar
    // OP nenhuma (ver pegarOrdemAction) — a tela explica o porquê.
    estacao
      ? inArray(
          ordensProducao.maquinaId,
          db
            .select({ id: maquinas.id })
            .from(maquinas)
            .where(
              and(
                eq(maquinas.estacaoId, estacao.id),
                isNull(maquinas.deletedAt),
              ),
            ),
        )
      : sql`false`,
  )!
}

// -----------------------------------------------------------------
// A regra de AÇÃO do operador
// -----------------------------------------------------------------
export type PermissaoDoOperador =
  | { pode: true; estacaoId: string }
  | { pode: false; erro: string }

/**
 * O operador age em QUALQUER OP da estação dele — não só na que ele pegou.
 * O motivo é de chão de fábrica: o turno acaba com a OP no meio e o colega
 * precisa conseguir terminar.
 *
 * "Da estação dele" é pela MÁQUINA da OP, não pelo responsável. OP sem
 * máquina é recusada de propósito: é isso que fecha a porta dos fundos entre
 * os itens C e D — sem esta recusa, o operador arrastaria uma OP da fila
 * direto pra 'em_producao' pelo kanban e ela entraria em produção sem
 * máquina nenhuma, furando o "escolher máquina é obrigatório" e quebrando a
 * premissa de que OP em produção sempre tem estação.
 *
 * Só vale pra `role === 'operador'`. Admin e gerente não passam por aqui.
 */
export async function operadorPodeAgirNaOrdem(
  operadorId: string,
  ordemMaquinaId: string | null,
): Promise<PermissaoDoOperador> {
  const estacao = await estacaoDoOperador(operadorId)
  if (!estacao) {
    return {
      pode: false,
      erro: 'Você não está em nenhuma estação — fale com o admin',
    }
  }
  if (!ordemMaquinaId) {
    return {
      pode: false,
      erro: 'Essa OP ainda não tem máquina. Use "Pegar pra mim" pra escolher uma e começar.',
    }
  }
  const [maquina] = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(
      and(
        eq(maquinas.id, ordemMaquinaId),
        eq(maquinas.estacaoId, estacao.id),
        isNull(maquinas.deletedAt),
      ),
    )
    .limit(1)
  if (!maquina) {
    return { pode: false, erro: 'Essa OP é de outra estação' }
  }
  return { pode: true, estacaoId: estacao.id }
}
