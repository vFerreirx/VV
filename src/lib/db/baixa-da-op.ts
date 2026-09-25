import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { eventosKanban, ordensProducao } from '@/lib/db/schema'
import { sincronizarEntradaDaOp } from '@/lib/db/entrada-da-op'
import { sincronizarReposicaoDaOp } from '@/lib/db/reposicao-da-op'

// A FINALIZAÇÃO DE UMA OP — o que acontece quando ela vai pra `enviado`.
//
// (O nome ainda é "baixa", de quando era o gerente quem dava. Na tela, desde
// 25/09/2026, é "Finalizada" — ver transicoes-da-op.ts.)
//
// Três portas finalizam, e todas passam por aqui:
//
//   - a CONCLUSÃO da OP fora de remessa (`concluirProducaoAction`), na mesma
//     transação que grava a conclusão;
//   - o MUDAR DESTINO de um Full já pronto pra Estoque, que vira OP fora de
//     remessa em Produção concluída e não pode ficar parada lá;
//   - o DESPACHO da remessa, que finaliza as OPs de Full de uma vez.
//
// Com uma cópia em cada, a primeira mudança na regra do estoque valeria só pra
// uma delas.
//
// ⚠️ SERVER-ONLY, E NÃO EXPORTADA DE UM ARQUIVO 'use server'. Toda função
// exportada de `ordens/actions.ts` vira endpoint público; esta recebe a
// transação por parâmetro e só pode rodar dentro de uma action que já
// conferiu permissão e regra.
//
// ⚠️ QUEM CONFERE SE PODE FINALIZAR NÃO É ESTA FUNÇÃO. Aqui fica o EFEITO:
// status, data de fim, histórico, estoque (`sincronizarEntradaDaOp` — a
// entrada é sempre igual às peças boas) e a fila de reposição (o item ligado
// a esta OP vira "Reposto" na mesma transação).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type OpParaBaixa = {
  id: string
  status: (typeof ordensProducao.$inferSelect)['status']
  dataRealFim: Date | null
}

/**
 * Grava a finalização dentro da transação `tx`. Devolve false quando a OP
 * mudou desde a leitura (o UPDATE é condicional no status lido) — quem chama decide
 * se isso é conflito ou só "alguém chegou antes".
 */
export async function gravarBaixa(
  tx: Tx,
  op: OpParaBaixa,
  { usuarioId, observacao }: { usuarioId: string; observacao: string | null },
): Promise<boolean> {
  const gravadas = await tx
    .update(ordensProducao)
    .set({
      status: 'enviado',
      // A data que já existe fica — o desfazer a limpa, então uma OP
      // desfeita e finalizada de novo não herda a data velha.
      dataRealFim: op.dataRealFim ?? new Date(),
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

  // O estoque recebe as peças boas — a regra e o porquê em entrada-da-op.ts.
  await sincronizarEntradaDaOp(tx, op.id, usuarioId)

  // A PEÇA QUE ESTAVA NA FILA DE REPOSIÇÃO FOI REPOSTA — na mesma transação
  // da finalização, pra fila nunca mostrar "Em produção" de uma OP pronta.
  await sincronizarReposicaoDaOp(tx, [op.id])
  return true
}
