import { and, desc, inArray, isNull } from 'drizzle-orm'

import { db } from '.'
import { tarefas } from './schema'
import type { PrioridadeAlerta } from '@/lib/prioridade'
import type { User } from '@/lib/db/schema'

// Sinal do menu: a MAIOR prioridade entre as tarefas EM ABERTO.
//
// Em aberto = não concluída e não excluída. O aviso acompanha o problema:
// só some quando a tarefa sai desse estado, nunca por tempo.
//
// UMA consulta, UMA linha. Este código roda no layout, ou seja, em TODA
// navegação, e a função (iad1) está longe do banco (sa-east-1) — cada
// ida custa. O `ORDER BY prioridade DESC LIMIT 1` sobre o índice parcial
// `tarefas_abertas_prioridade_idx` lê uma entrada só; contar a lista no
// cliente seria trazer o histórico inteiro pra descobrir uma bolinha.
//
// O `inArray` não é filtro redundante: sem ele a consulta ainda leria uma
// linha, mas devolveria 'normal' pra ser descartado em TypeScript — o banco
// pode parar assim que a varredura sai de alta/urgente.
export async function alertaDeTarefas(
  role: User['role'],
): Promise<PrioridadeAlerta> {
  // /tarefas é área de admin e não editável em /permissoes. Quem não vê o
  // item no menu não gera nem a consulta — o indicador não existe pra ele.
  if (role !== 'admin') return null

  const [linha] = await db
    .select({ prioridade: tarefas.prioridade })
    .from(tarefas)
    .where(
      and(
        isNull(tarefas.deletedAt),
        isNull(tarefas.concluidaEm),
        inArray(tarefas.prioridade, ['alta', 'urgente']),
      ),
    )
    // A ordem interna do enum (baixa < normal < alta < urgente) é a ordem de
    // comparação no Postgres: urgente vem primeiro sem CASE nenhum.
    .orderBy(desc(tarefas.prioridade))
    .limit(1)

  const p = linha?.prioridade
  return p === 'urgente' || p === 'alta' ? p : null
}
