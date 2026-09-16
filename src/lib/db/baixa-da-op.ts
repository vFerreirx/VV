import 'server-only'

import { and, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  apontamentosProducao,
  eventosKanban,
  movimentacoesEstoque,
  ordensProducao,
} from '@/lib/db/schema'
import { sincronizarReposicaoDaOp } from '@/lib/db/reposicao-da-op'

// A BAIXA DE UMA OP — o que acontece quando ela vai pra `enviado`.
//
// Duas portas dão baixa: a individual (`mudarStatusOrdemAction`, o "Dar baixa"
// do painel) e o DESPACHO da remessa, que dá baixa em várias de uma vez. Com
// uma cópia em cada, a primeira mudança na regra do estoque valeria só pra uma
// delas — e a outra continuaria dando entrada de um jeito que ninguém lembra.
//
// ⚠️ SERVER-ONLY, E NÃO EXPORTADA DE UM ARQUIVO 'use server'. Toda função
// exportada de `ordens/actions.ts` vira endpoint público; esta recebe a
// transação por parâmetro e só pode rodar dentro de uma action que já
// conferiu permissão e regra.
//
// ⚠️ QUEM CONFERE SE PODE DAR BAIXA NÃO É ESTA FUNÇÃO. A regra
// (`erroDaTransicaoGenerica`, src/lib/producao/transicoes-da-op.ts — só a
// partir de Produção concluída, e com apontamento) é conferida por quem chama.
// Aqui fica o EFEITO: status, data de fim, histórico, estoque e a fila de
// reposição (o item ligado a esta OP vira "Reposto" na mesma transação).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type OpParaBaixa = {
  id: string
  status: (typeof ordensProducao.$inferSelect)['status']
  canalDestino: (typeof ordensProducao.$inferSelect)['canalDestino']
  produtoId: string
  variacaoId: string | null
  dataRealFim: Date | null
}

/**
 * Grava a baixa dentro da transação `tx`. Devolve false quando a OP mudou
 * desde a leitura (o UPDATE é condicional no status lido) — quem chama decide
 * se isso é conflito ou só "alguém chegou antes".
 */
export async function gravarBaixa(
  tx: Tx,
  op: OpParaBaixa,
  {
    usuarioId,
    observacao,
    responsavelId,
  }: {
    usuarioId: string
    observacao: string | null
    /** Só o operador toma a OP ao agir (ver `mudarStatusOrdemAction`). */
    responsavelId?: string
  },
): Promise<boolean> {
  const gravadas = await tx
    .update(ordensProducao)
    .set({
      status: 'enviado',
      dataRealFim: op.dataRealFim ?? new Date(),
      ...(responsavelId ? { responsavelId } : {}),
    })
    .where(
      and(
        eq(ordensProducao.id, op.id),
        isNull(ordensProducao.deletedAt),
        eq(ordensProducao.status, op.status),
      ),
    )
    .returning({ id: ordensProducao.id })
  if (gravadas.length === 0) return false

  await tx.insert(eventosKanban).values({
    ordemId: op.id,
    statusAnterior: op.status,
    statusNovo: 'enviado',
    usuarioId,
    observacao,
  })

  // OP com BAIXA pro canal "Estoque" entra no estoque — uma vez só.
  if (op.canalDestino === 'estoque') {
    const [existente] = await tx
      .select({ id: movimentacoesEstoque.id })
      .from(movimentacoesEstoque)
      .where(
        and(
          eq(movimentacoesEstoque.referenciaId, op.id),
          eq(movimentacoesEstoque.tipo, 'entrada_producao'),
        ),
      )
      .limit(1)
    if (!existente) {
      const [agg] = await tx
        .select({
          total: sql<number>`coalesce(sum(${apontamentosProducao.quantidadeProduzida}), 0)::int`,
        })
        .from(apontamentosProducao)
        .where(eq(apontamentosProducao.ordemId, op.id))
      // ⚠️ SÓ O APONTADO ENTRA. Havia um fallback: soma zero dava entrada da
      // META — uma OP de 30 que rendeu 27, sem apontamento, entrava como 30.
      // A porta da baixa exige apontamento, e com apontamento só de refugo a
      // soma é zero e nada entra: é a verdade, nenhuma peça boa saiu.
      const qtd = agg?.total ?? 0
      if (qtd > 0) {
        await tx.insert(movimentacoesEstoque).values({
          produtoId: op.produtoId,
          variacaoId: op.variacaoId,
          tipo: 'entrada_producao',
          quantidade: qtd,
          referenciaId: op.id,
          referenciaTipo: 'ordem',
          usuarioId,
        })
      }
    }
  }

  // A PEÇA QUE ESTAVA NA FILA DE REPOSIÇÃO FOI REPOSTA — na mesma transação
  // da baixa, pra fila nunca mostrar "Em produção" de uma OP já baixada.
  await sincronizarReposicaoDaOp(tx, [op.id])
  return true
}
