import 'server-only'

import { and, asc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  apontamentosProducao,
  movimentacoesEstoque,
  ordensProducao,
} from '@/lib/db/schema'
import { entradaEsperada } from '@/lib/producao/transicoes-da-op'

// A ENTRADA DE UMA OP NO ESTOQUE — sempre igual às peças boas dela.
//
// A regra é pura (`entradaEsperada`, transicoes-da-op.ts): OP finalizada no
// canal Estoque tem entrada igual à soma das peças boas; qualquer outra tem
// zero. Esta função faz o banco concordar com ela, e é chamada por TODO
// caminho que finaliza, desfinaliza ou muda peça de uma OP finalizada — a
// finalização (`gravarBaixa`), o desfazer, o corrigir, o formulário de edição
// e o mudar destino. Antes a entrada era dada "uma vez só" e ninguém mais
// mexia nela: desfazer e concluir de novo com outro número deixava o estoque
// com o número velho.
//
// ⚠️ NO MÁXIMO UMA LINHA `entrada_producao` POR OP. Existindo, é ATUALIZADA
// (quantidade, produto e variação — o formulário pode trocar os dois); faltando,
// é criada; com o alvo zero, sai. Não há gatilho nem regra no banco que
// impeça UPDATE/DELETE em `movimentacoes_estoque` (conferido em 25/09/2026).
//
// ⚠️ SERVER-ONLY e recebe a transação: roda dentro de uma action que já
// conferiu permissão e já gravou o status novo — é o status DE AGORA, lido
// aqui dentro, que decide.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function sincronizarEntradaDaOp(
  tx: Tx,
  ordemId: string,
  usuarioId: string,
): Promise<void> {
  const [op] = await tx
    .select({
      status: ordensProducao.status,
      canalDestino: ordensProducao.canalDestino,
      produtoId: ordensProducao.produtoId,
      variacaoId: ordensProducao.variacaoId,
      deletedAt: ordensProducao.deletedAt,
      pecasBoas: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
    })
    .from(ordensProducao)
    .where(eq(ordensProducao.id, ordemId))
    .limit(1)
  if (!op) return

  const alvo = entradaEsperada(
    {
      status: op.status,
      canalDestino: op.canalDestino,
      excluida: op.deletedAt !== null,
    },
    op.pecasBoas ?? 0,
  )

  const existentes = await tx
    .select({
      id: movimentacoesEstoque.id,
      quantidade: movimentacoesEstoque.quantidade,
      produtoId: movimentacoesEstoque.produtoId,
      variacaoId: movimentacoesEstoque.variacaoId,
    })
    .from(movimentacoesEstoque)
    .where(
      and(
        eq(movimentacoesEstoque.referenciaId, ordemId),
        eq(movimentacoesEstoque.tipo, 'entrada_producao'),
      ),
    )
    .orderBy(asc(movimentacoesEstoque.createdAt))

  const [primeira, ...sobras] = existentes
  // Duplicatas (se alguma vez existirem) saem sempre: a regra é uma linha.
  for (const s of sobras) {
    await tx.delete(movimentacoesEstoque).where(eq(movimentacoesEstoque.id, s.id))
  }

  if (alvo === 0) {
    if (primeira) {
      await tx
        .delete(movimentacoesEstoque)
        .where(eq(movimentacoesEstoque.id, primeira.id))
    }
    return
  }

  if (!primeira) {
    await tx.insert(movimentacoesEstoque).values({
      produtoId: op.produtoId,
      variacaoId: op.variacaoId,
      tipo: 'entrada_producao',
      quantidade: alvo,
      referenciaId: ordemId,
      referenciaTipo: 'ordem',
      usuarioId,
    })
    return
  }

  if (
    primeira.quantidade !== alvo ||
    primeira.produtoId !== op.produtoId ||
    primeira.variacaoId !== op.variacaoId
  ) {
    await tx
      .update(movimentacoesEstoque)
      .set({
        quantidade: alvo,
        produtoId: op.produtoId,
        variacaoId: op.variacaoId,
      })
      .where(eq(movimentacoesEstoque.id, primeira.id))
  }
}
