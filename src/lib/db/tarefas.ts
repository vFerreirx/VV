import { and, isNull, sql } from 'drizzle-orm'

import { db } from '.'
import { tarefas } from './schema'
import {
  ehDestaque,
  maiorPrioridade,
  type PrioridadeAlerta,
  type PrioridadeNivel,
} from '@/lib/prioridade'
import { escalarPorPrazo } from '@/lib/validators/tarefas'
import type { User } from '@/lib/db/schema'

// Sinal do menu: a maior prioridade EFETIVA entre as tarefas em aberto.
//
// Em aberto = não concluída e não excluída. O aviso acompanha o problema:
// só some quando a tarefa sai desse estado, nunca por tempo.
//
// O BANCO NÃO CONHECE A REGRA DA ESCALADA, e é isso que mantém o menu e a
// tela dizendo a mesma coisa. Ele devolve dois FATOS CRUS —
//
//   1. o maior nível marcado à mão entre as abertas
//   2. o prazo mais próximo entre as abertas
//
// — e a regra (src/lib/validators/tarefas.ts) é aplicada aqui em cima, a
// mesma função que a lista usa. Uma segunda cópia num ORDER BY divergiria
// no dia que os limites mudassem, sem ninguém ver.
//
// A CONTA FECHA porque o maior efetivo do conjunto é o maior entre (maior
// marcado) e (maior derivado), e o derivado só cresce quando a data se
// aproxima — então o maior derivado é sempre o do prazo MAIS PRÓXIMO. Dois
// escalares bastam; não é preciso olhar tarefa por tarefa.
//
// `to_char` NÃO É ENFEITE. `db.execute` fala com o driver CRU, sem o
// mapeamento de colunas do Drizzle — e o postgres-js transforma `date` num
// objeto `Date` do JavaScript. `escalarPorPrazo` espera a string
// 'YYYY-MM-DD' (é assim que o resto do arquivo compara prazo, justamente pra
// não trazer fuso pra dentro de uma data sem hora), então quem sai do
// `execute` precisa nascer texto. `::text` dependeria do DateStyle da
// sessão; `to_char` não depende de nada.
//
// UMA IDA AO BANCO, DUAS LINHAS LIDAS. Este código roda no layout, ou seja,
// em TODA navegação, e a função (iad1) está longe do banco (sa-east-1). As
// duas subconsultas são `ORDER BY ... LIMIT 1` sobre os índices parciais que
// já existem — `tarefas_abertas_prioridade_idx` (por prioridade, migration
// 46) e `tarefas_pendentes_idx` (por prazo, migration 35) —, então cada uma
// lê UMA entrada, não importa o tamanho do histórico.
export async function alertaDeTarefas(role: User['role']): Promise<PrioridadeAlerta> {
  // /tarefas é área de admin e não editável em /permissoes. Quem não vê o
  // item no menu não gera nem a consulta — o indicador não existe pra ele.
  if (role !== 'admin') return null

  const aberta = and(isNull(tarefas.deletedAt), isNull(tarefas.concluidaEm))

  const linhas = await db.execute<{
    nivel: PrioridadeNivel | null
    prazo: string | null
  }>(sql`
    SELECT
      (SELECT prioridade FROM ${tarefas}
        WHERE ${aberta}
        -- A ordem interna do enum (baixa < normal < alta < urgente) é a
        -- ordem de comparação no Postgres: urgente primeiro, sem CASE.
        ORDER BY prioridade DESC
        LIMIT 1) AS nivel,
      (SELECT to_char(prazo, 'YYYY-MM-DD') FROM ${tarefas}
        WHERE ${aberta}
        -- ASC põe NULL por último no Postgres, então a primeira entrada é o
        -- prazo mais próximo de verdade e tarefa sem data não atrapalha.
        ORDER BY prazo ASC
        LIMIT 1) AS prazo
  `)

  const linha = linhas[0]
  if (!linha) return null

  const efetiva = maiorPrioridade(linha.nivel ?? 'baixa', escalarPorPrazo(linha.prazo))
  return ehDestaque(efetiva) ? efetiva : null
}
