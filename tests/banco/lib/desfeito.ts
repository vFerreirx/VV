// UMA transação de fora, e a única saída dela é o ROLLBACK.
//
// As actions recebem esta transação no lugar do `db` (mocks.ts), então os
// `db.transaction(...)` delas viram SAVEPOINT dentro dela. No fim, um `throw`
// de propósito desfaz tudo; qualquer erro no meio também desfaz.

import { sql } from 'drizzle-orm'

import type { Banco, Tx } from './conexao'

class Desfazer extends Error {}

/**
 * ⚠️ TIMEOUTS CURTOS: o teste segura, por segundos, a linha do
 * `op_numero_counter` (o gatilho da numeração) e o índice único das máquinas
 * que usa. Ele nunca pode ficar esperando atrás da produção, nem segurá-la
 * mais do que isso: se travar, cai e desfaz.
 */
export async function rodarDesfeito(
  db: Banco,
  fn: (tx: Tx) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`)
      await tx.execute(sql`SET LOCAL statement_timeout = '20s'`)
      await fn(tx)
      throw new Desfazer()
    })
  } catch (erro) {
    if (erro instanceof Desfazer) return
    throw erro
  }
  // Chegar aqui é o COMMIT que nunca pode acontecer.
  throw new Error('A transação do teste terminou sem ser desfeita')
}
