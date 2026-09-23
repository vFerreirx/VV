import 'server-only'

import { inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { produtos } from '@/lib/db/schema'
import { erroDeOrigemParaOp } from '@/lib/produtos/origem'

/**
 * A GUARDA ÚNICA: produto de parceiro não vira OP.
 *
 * ⚠️ A TELA PODE MENTIR, A ACTION NÃO. As listas de quem cria OP já escondem
 * produto de parceiro (`listarProdutosParaOrdem({ semParceiro: true })`), mas
 * uma aba aberta desde antes de o produto virar "parceiro", ou uma chamada
 * direta, passa por qualquer filtro de tela. Por isso TODA action que cria OP
 * chama isto antes de inserir:
 *
 *   - `criarOrdemAction` (Nova OP, reposição → OP e faltante → OP);
 *   - `atualizarOrdemAction`, quando troca o produto da OP;
 *   - `gerarOpsDoKitAction` (Gerar de kit — diz QUAL componente);
 *   - `importarFullAction` e `criarOpsFullAction` (Full).
 *
 * Devolve null quando todos são produzidos, senão a frase pra action
 * devolver. A regra (e o teste) mora em src/lib/produtos/origem.ts.
 */
export async function erroDeProdutoDeParceiro(
  produtoIds: readonly string[],
): Promise<string | null> {
  const ids = [...new Set(produtoIds)]
  if (ids.length === 0) return null
  const linhas = await db
    .select({ nome: produtos.nome, origem: produtos.origem })
    .from(produtos)
    .where(inArray(produtos.id, ids))
  return erroDeOrigemParaOp(linhas)
}
