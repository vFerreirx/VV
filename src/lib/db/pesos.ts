import { and, asc, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import { db } from '.'
import { tamanhos, variacoesProduto } from './schema'
import type { TamanhoDoProduto } from '@/lib/peso'

// Tamanhos distintos das variações de cada produto, com o peso cadastrado em
// cada um. É a origem do peso quando o produto não tem override — o cadastro
// de produtos e o de kits leem os dois daqui.
//
// Uma consulta só pra lista inteira (nada de N+1). O vínculo variação →
// tamanho é por NOME, comparado sem caixa igual `src/lib/peso.ts` faz no
// pedido: assim o peso que aparece no cadastro é o mesmo que vai somar no
// frete.
export async function tamanhosPesoPorProduto(
  produtoIds: string[],
): Promise<Map<string, TamanhoDoProduto[]>> {
  const porProduto = new Map<string, TamanhoDoProduto[]>()
  if (produtoIds.length === 0) return porProduto

  const vinculos = await db
    .selectDistinct({
      produtoId: variacoesProduto.produtoId,
      tamanho: variacoesProduto.tamanho,
      pesoGramas: tamanhos.pesoGramas,
    })
    .from(variacoesProduto)
    .leftJoin(
      tamanhos,
      and(
        sql`lower(${tamanhos.nome}) = lower(${variacoesProduto.tamanho})`,
        isNull(tamanhos.deletedAt),
      ),
    )
    .where(
      and(
        inArray(variacoesProduto.produtoId, produtoIds),
        isNull(variacoesProduto.deletedAt),
        isNotNull(variacoesProduto.tamanho),
      ),
    )
    .orderBy(asc(variacoesProduto.tamanho))

  for (const v of vinculos) {
    if (!v.tamanho) continue
    const lista = porProduto.get(v.produtoId) ?? []
    lista.push({ tamanho: v.tamanho, pesoGramas: v.pesoGramas })
    porProduto.set(v.produtoId, lista)
  }

  return porProduto
}
