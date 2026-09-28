// A prova de que nada ficou: o retrato de antes e o de depois, tirados FORA da
// transação, têm que ser iguais.

import { sql } from 'drizzle-orm'

import type { Banco } from './conexao'

/**
 * O texto que marca toda linha que o teste cria (observacoes da OP,
 * observacao da remessa e da reposição). Achar isto no banco depois do teste
 * quer dizer que algo foi gravado de verdade.
 */
export const MARCA = '[test:banco] linha de teste, desfeita no fim'

export type Retrato = Record<string, number>

export async function tirarRetrato(db: Banco): Promise<Retrato> {
  const [linha] = await db.execute<Record<string, number>>(sql`
    SELECT
      (SELECT count(*) FROM ordens_producao)::int         AS ordens_producao,
      (SELECT count(*) FROM eventos_kanban)::int          AS eventos_kanban,
      (SELECT count(*) FROM apontamentos_producao)::int   AS apontamentos_producao,
      (SELECT count(*) FROM movimentacoes_estoque)::int   AS movimentacoes_estoque,
      (SELECT count(*) FROM reposicoes_estoque)::int      AS reposicoes_estoque,
      (SELECT count(*) FROM remessas_full)::int           AS remessas_full,
      (SELECT COALESCE(sum(ultimo_numero), 0) FROM op_numero_counter)::int
                                                          AS op_numero_counter,
      (
        (SELECT count(*) FROM ordens_producao WHERE observacoes = ${MARCA}) +
        (SELECT count(*) FROM remessas_full WHERE observacao = ${MARCA}) +
        (SELECT count(*) FROM reposicoes_estoque WHERE observacao = ${MARCA})
      )::int                                              AS linhas_com_a_marca
  `)
  return { ...linha }
}

/** As divergências entre os dois retratos, uma frase por linha. */
export function divergencias(antes: Retrato, depois: Retrato): string[] {
  const erros: string[] = []
  for (const chave of Object.keys(antes)) {
    if (antes[chave] !== depois[chave]) {
      erros.push(`${chave}: ${antes[chave]} antes, ${depois[chave]} depois`)
    }
  }
  if (depois.linhas_com_a_marca !== 0) {
    erros.push(`${depois.linhas_com_a_marca} linha(s) com a marca do teste no banco`)
  }
  return erros
}
