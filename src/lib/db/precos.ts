import { eq, inArray } from 'drizzle-orm'

import { db } from '.'
import { produtoTamanhoPreco, tamanhos } from './schema'
import { decimalParaCentavos } from '@/lib/preco'

// Preço de tabela de cada produto, indexado por NOME do tamanho em
// minúscula. Par de `tamanhosPesoPorProduto` (src/lib/db/pesos.ts): aquele
// diz quais tamanhos o produto oferece e quanto pesam, este diz quanto
// custam.
//
// Uma consulta só pra lista inteira (nada de N+1). A chave é o nome sem
// caixa porque é assim que a variação guarda o tamanho — texto, não FK — e
// é assim que o builder do pedido procura (ver `chave` em src/lib/preco.ts).
export async function precosPorProduto(
  produtoIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const porProduto = new Map<string, Map<string, number>>()
  if (produtoIds.length === 0) return porProduto

  const linhas = await db
    .select({
      produtoId: produtoTamanhoPreco.produtoId,
      tamanho: tamanhos.nome,
      preco: produtoTamanhoPreco.preco,
    })
    .from(produtoTamanhoPreco)
    .innerJoin(tamanhos, eq(tamanhos.id, produtoTamanhoPreco.tamanhoId))
    .where(inArray(produtoTamanhoPreco.produtoId, produtoIds))

  for (const l of linhas) {
    const mapa = porProduto.get(l.produtoId) ?? new Map<string, number>()
    mapa.set(l.tamanho.trim().toLowerCase(), decimalParaCentavos(l.preco))
    porProduto.set(l.produtoId, mapa)
  }

  return porProduto
}
