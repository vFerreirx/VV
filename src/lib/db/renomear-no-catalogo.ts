import 'server-only'

import { and, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { variacoesProduto } from '@/lib/db/schema'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * RENOMEAR COR OU MODELO LEVA AS VARIAÇÕES JUNTO.
 *
 * A variação guarda cor e modelo como TEXTO (não FK — ver o topo de
 * uso-do-catalogo.ts). Renomear só o cadastro deixava as variações com o nome
 * velho: o modelo "SUETER GOLA V" virou "SUETER" e as 18 variações do suéter
 * ficaram fora do cadastro, a amostra de cor (que casa `cores.nome =
 * variacoes_produto.cor`) sumia do tablet, e a auditoria acusava "modelo fora
 * do cadastro".
 *
 * Roda DENTRO da transação do UPDATE do cadastro: ou os dois mudam, ou
 * nenhum. Só as variações VIVAS de produto vivo (as mesmas que o contador de
 * /variacoes conta, `contarPorTexto`); a excluída é histórico e fica como
 * estava. Compara sem caixa e sem espaço nas pontas, como o resto do
 * catálogo.
 *
 * ⚠️ O SKU NUNCA MUDA. Ele pode estar anunciado no marketplace e no de-para do
 * Full; trocar o nome da cor não é motivo pra quebrar nenhum dos dois.
 *
 * Devolve quantas variações mudaram. Nome igual (a menos de espaço nas
 * pontas) não mexe em nada.
 */
export async function renomearNasVariacoes(
  tx: Tx,
  eixo: 'cor' | 'modelo',
  nomeAntigo: string,
  nomeNovo: string,
): Promise<number> {
  const antigo = nomeAntigo.trim()
  const novo = nomeNovo.trim()
  if (antigo === novo) return 0

  const coluna = eixo === 'cor' ? variacoesProduto.cor : variacoesProduto.modelo
  const linhas = await tx
    .update(variacoesProduto)
    .set(eixo === 'cor' ? { cor: novo } : { modelo: novo })
    .where(
      and(
        isNull(variacoesProduto.deletedAt),
        sql`lower(trim(${coluna})) = ${antigo.toLowerCase()}`,
        // Qualificado à mão: interpolar a coluna pelo Drizzle gera o nome
        // sem tabela, e dentro da subconsulta `id` resolveria pro escopo
        // errado — mesmo cuidado de `listarProdutos` (produtos/actions.ts).
        sql`EXISTS (
          SELECT 1 FROM "produtos"
           WHERE "produtos"."id" = "variacoes_produto"."produto_id"
             AND "produtos"."deleted_at" IS NULL)`,
      ),
    )
    .returning({ id: variacoesProduto.id })
  return linhas.length
}

/** "· 18 variações atualizadas junto", ou nada quando não mexeu em nenhuma. */
export function sufixoDasVariacoes(n: number): string {
  if (n === 0) return ''
  return n === 1
    ? ' · 1 variação atualizada junto'
    : ` · ${n} variações atualizadas junto`
}
