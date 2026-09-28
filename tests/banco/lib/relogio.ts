// O TEMPO PASSA ENTRE UMA AÇÃO E OUTRA.
//
// Dentro de uma transação o `now()` é o mesmo pra tudo: toda linha que as
// actions gravam nasce no mesmo instante. Só que o desfazer, a "conclusão
// mais recente" e a "última transição" (src/lib/db/conclusao-da-op.ts) se
// decidem por `created_at` — com tudo empatado, a conclusão refeita e a
// desfeita seriam a mesma. Então, entre uma ação e outra, o que o teste já
// gravou recua 1 minuto. Dentro de uma mesma action tudo fica no mesmo
// instante, igual à produção.

import { inArray, sql } from 'drizzle-orm'

import {
  apontamentosProducao,
  eventosKanban,
  movimentacoesEstoque,
} from '@/lib/db/schema'

import type { Tx } from './conexao'

export async function passarUmMinuto(tx: Tx, opIds: readonly string[]) {
  if (opIds.length === 0) return
  const ids = [...opIds]
  await tx
    .update(eventosKanban)
    .set({ createdAt: sql`${eventosKanban.createdAt} - interval '1 minute'` })
    .where(inArray(eventosKanban.ordemId, ids))
  await tx
    .update(apontamentosProducao)
    .set({
      createdAt: sql`${apontamentosProducao.createdAt} - interval '1 minute'`,
    })
    .where(inArray(apontamentosProducao.ordemId, ids))
  await tx
    .update(movimentacoesEstoque)
    .set({
      createdAt: sql`${movimentacoesEstoque.createdAt} - interval '1 minute'`,
    })
    .where(inArray(movimentacoesEstoque.referenciaId, ids))
}
