import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { eventosKanban, ordensProducao } from '@/lib/db/schema'
import { sincronizarReposicaoDaOp } from '@/lib/db/reposicao-da-op'
import { OP_DEVOLVIDA } from '@/lib/producao/transicoes-da-op'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * DEVOLVE A OP À FILA — a gravação única dos dois gestos: o "Peguei errado"
 * do tablet (`devolverOpParaFilaAction`) e o arrastar do gerente de "Em
 * produção" pra "Programado" (`mudarStatusOrdemAction`). A regra do que volta
 * a vazio mora em `OP_DEVOLVIDA` (src/lib/producao/transicoes-da-op.ts).
 *
 * ⚠️ UPDATE CONDICIONAL ao estado LIDO — status E máquina. Se alguém concluiu
 * a OP, ou ela mudou de máquina, entre a leitura e o toque, nenhuma linha muda
 * e a função devolve false: quem chamou diz "alguém mexeu nessa OP".
 *
 * A remessa Full e o prazo não são tocados: a OP continua indo pro mesmo
 * lugar. Roda DENTRO da transação de quem chama, com o evento no histórico.
 */
export async function devolverOpParaFila(
  tx: Tx,
  op: { id: string; status: 'em_producao'; maquinaId: string | null },
  quem: { id: string; nome: string },
): Promise<boolean> {
  const linhas = await tx
    .update(ordensProducao)
    .set({ ...OP_DEVOLVIDA })
    .where(
      and(
        eq(ordensProducao.id, op.id),
        isNull(ordensProducao.deletedAt),
        eq(ordensProducao.status, op.status),
        op.maquinaId === null
          ? isNull(ordensProducao.maquinaId)
          : eq(ordensProducao.maquinaId, op.maquinaId),
      ),
    )
    .returning({ id: ordensProducao.id })
  if (linhas.length === 0) return false

  await tx.insert(eventosKanban).values({
    ordemId: op.id,
    statusAnterior: op.status,
    statusNovo: OP_DEVOLVIDA.status,
    usuarioId: quem.id,
    observacao: `Devolvida à fila por ${quem.nome}`,
  })
  // O item de reposição ligado segue a OP (em produção continua sendo "em
  // produção" pra fila de reposição: a OP ainda vai ser feita).
  await sincronizarReposicaoDaOp(tx, [op.id])
  return true
}
