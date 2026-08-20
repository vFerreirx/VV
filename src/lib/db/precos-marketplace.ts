import { eq } from 'drizzle-orm'

import { db } from '.'
import { kitTamanhoPrecoMarketplace, produtoTamanhoPrecoMarketplace, tamanhos } from './schema'
import {
  ehCanalComPreco,
  tabelaMarketplaceVazia,
  type PrecosPorCanal,
} from '@/lib/preco-marketplace'
import { chave, chaveKit, decimalParaCentavos } from '@/lib/preco'

// ⚠️ Preço de ANÚNCIO. Não alimenta pedido — ver o topo de
// src/lib/preco-marketplace.ts.
//
// DUAS consultas pra grade inteira, nada de N+1: são ~126 linhas no total e
// a tela mostra todas de uma vez. Mesmo espírito de src/lib/db/precos.ts.
export async function precosDeMarketplace(): Promise<PrecosPorCanal> {
  const [deProduto, deKit] = await Promise.all([
    db
      .select({
        produtoId: produtoTamanhoPrecoMarketplace.produtoId,
        tamanho: tamanhos.nome,
        marketplace: produtoTamanhoPrecoMarketplace.marketplace,
        preco: produtoTamanhoPrecoMarketplace.preco,
      })
      .from(produtoTamanhoPrecoMarketplace)
      .innerJoin(tamanhos, eq(tamanhos.id, produtoTamanhoPrecoMarketplace.tamanhoId)),
    // Sem join com `tamanhos`: a chave do kit é a COMBINAÇÃO de tamanhos,
    // gravada canônica por `chaveDeTamanhos` (src/lib/kit-tamanhos.ts).
    db
      .select({
        kitId: kitTamanhoPrecoMarketplace.kitId,
        combinacao: kitTamanhoPrecoMarketplace.combinacao,
        marketplace: kitTamanhoPrecoMarketplace.marketplace,
        preco: kitTamanhoPrecoMarketplace.preco,
      })
      .from(kitTamanhoPrecoMarketplace),
  ])

  const porCanal: PrecosPorCanal = {}
  // O CHECK do banco já limita os valores, mas a coluna é `text`: um canal
  // desconhecido é descartado aqui em vez de virar chave fantasma no objeto.
  const doCanal = (c: string) => {
    if (!ehCanalComPreco(c)) return null
    return (porCanal[c] ??= tabelaMarketplaceVazia())
  }

  for (const l of deProduto) {
    const t = doCanal(l.marketplace)
    if (t) t.produto[chave(l.produtoId, l.tamanho)] = decimalParaCentavos(l.preco)
  }
  for (const l of deKit) {
    const t = doCanal(l.marketplace)
    if (t) t.kit[chaveKit(l.kitId, l.combinacao)] = decimalParaCentavos(l.preco)
  }
  return porCanal
}
