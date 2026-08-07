import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import { db } from '.'
import { produtoTamanhoPeso, tamanhos, variacoesProduto } from './schema'
import type { TamanhoDoProduto } from '@/lib/peso'

// Tamanhos distintos das variações de cada produto, com o peso EFETIVO de
// cada um: o do par (produto, tamanho) quando existe, senão o do tamanho.
// O cadastro de produtos e o de kits leem os dois daqui.
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
      pesoDoTamanho: tamanhos.pesoGramas,
      pesoDoPar: produtoTamanhoPeso.pesoGramas,
    })
    .from(variacoesProduto)
    .leftJoin(
      tamanhos,
      and(
        sql`lower(${tamanhos.nome}) = lower(${variacoesProduto.tamanho})`,
        isNull(tamanhos.deletedAt),
      ),
    )
    // O par é por (produto, tamanho); o join sai do tamanho já resolvido
    // acima pra não repetir a comparação por nome.
    .leftJoin(
      produtoTamanhoPeso,
      and(
        eq(produtoTamanhoPeso.produtoId, variacoesProduto.produtoId),
        eq(produtoTamanhoPeso.tamanhoId, tamanhos.id),
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
    lista.push({
      tamanho: v.tamanho,
      pesoGramas: v.pesoDoPar ?? v.pesoDoTamanho,
    })
    porProduto.set(v.produtoId, lista)
  }

  return porProduto
}
