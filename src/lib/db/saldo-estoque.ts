import 'server-only'

import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  movimentacoesEstoque,
  produtos,
  variacoesProduto,
} from '@/lib/db/schema'

// O SALDO POR VARIAÇÃO — GUARDADO, SEM TELA.
//
// ⚠️ NINGUÉM CHAMA ISTO HOJE, e é de propósito. O /estoque mostrava este
// número, mas nada no sistema registra SAÍDA (vendas não mexe em estoque, a
// separação de pedido não sabe o que tem): o saldo só crescia, e mostrava
// mais peça do que existe. A tela virou a fila de reposição
// (src/app/(app)/estoque/).
//
// A infraestrutura continua viva: `movimentacoes_estoque` segue recebendo a
// entrada da baixa de OP de canal Estoque (src/lib/db/baixa-da-op.ts). Quando
// as estoquistas usarem o sistema e houver registro de saída e contagem, o
// saldo volta a ter sentido — e a consulta está aqui, em módulo server-only
// (e não num arquivo 'use server', onde viraria endpoint público sem uso).

export type SaldoDaVariacao = {
  variacaoId: string
  produtoId: string
  saldo: number
}

export async function saldoPorVariacao(): Promise<SaldoDaVariacao[]> {
  // Qualificar "variacoes_produto"."id" à mão: interpolar a coluna gera o
  // identificador sem tabela, e como movimentacoes_estoque também tem `id`, o
  // Postgres resolvia pro escopo da subquery — o saldo dava sempre 0.
  const saldoSql = sql<number>`(
    SELECT COALESCE(SUM(${movimentacoesEstoque.quantidade}), 0)::int
    FROM ${movimentacoesEstoque}
    WHERE ${movimentacoesEstoque.variacaoId} = "variacoes_produto"."id"
  )`

  const rows = await db
    .select({
      variacaoId: variacoesProduto.id,
      produtoId: produtos.id,
      saldo: saldoSql,
    })
    .from(variacoesProduto)
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(and(isNull(variacoesProduto.deletedAt), isNull(produtos.deletedAt)))
    .orderBy(asc(produtos.sku), asc(variacoesProduto.skuVariacao))

  return rows.map((r) => ({ ...r, saldo: r.saldo ?? 0 }))
}
