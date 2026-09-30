// A prova de que nada ficou: o retrato de antes e o de depois, tirados FORA da
// transação, têm que ser iguais.

import { asc, isNull, sql } from 'drizzle-orm'

import { maquinas } from '@/lib/db/schema'

import type { Banco } from './conexao'

/**
 * O texto que marca toda linha que o teste cria (observacoes da OP,
 * observacao da remessa e da reposição). Achar isto no banco depois do teste
 * quer dizer que algo foi gravado de verdade.
 */
export const MARCA = '[test:banco] linha de teste, desfeita no fim'

export type Retrato = {
  contagens: Record<string, number>
  /**
   * O status de cada máquina viva, por id. O teste para e volta uma máquina
   * de verdade: se o "Voltou" não fosse desfeito, ela ficaria em manutenção
   * na fábrica.
   */
  maquinas: Record<string, { codigo: string; status: string }>
}

export async function tirarRetrato(db: Banco): Promise<Retrato> {
  const [linha] = await db.execute<Record<string, number>>(sql`
    SELECT
      (SELECT count(*) FROM ordens_producao)::int         AS ordens_producao,
      (SELECT count(*) FROM eventos_kanban)::int          AS eventos_kanban,
      (SELECT count(*) FROM apontamentos_producao)::int   AS apontamentos_producao,
      (SELECT count(*) FROM movimentacoes_estoque)::int   AS movimentacoes_estoque,
      (SELECT count(*) FROM reposicoes_estoque)::int      AS reposicoes_estoque,
      (SELECT count(*) FROM remessas_full)::int           AS remessas_full,
      (SELECT count(*) FROM maquina_paradas)::int         AS maquina_paradas,
      -- LEGADO desde o PR #16: ninguém lê nem grava. Tem que ficar intocado.
      (SELECT count(*) FROM estacao_operadores)::int      AS estacao_operadores,
      (SELECT COALESCE(sum(ultimo_numero), 0) FROM op_numero_counter)::int
                                                          AS op_numero_counter,
      (
        (SELECT count(*) FROM ordens_producao WHERE observacoes = ${MARCA}) +
        (SELECT count(*) FROM remessas_full WHERE observacao = ${MARCA}) +
        (SELECT count(*) FROM reposicoes_estoque WHERE observacao = ${MARCA})
      )::int                                              AS linhas_com_a_marca
  `)
  const vivas = await db
    .select({ id: maquinas.id, codigo: maquinas.codigo, status: maquinas.status })
    .from(maquinas)
    .where(isNull(maquinas.deletedAt))
    .orderBy(asc(maquinas.codigo))
  return {
    contagens: { ...linha },
    maquinas: Object.fromEntries(
      vivas.map((m) => [m.id, { codigo: m.codigo, status: m.status }]),
    ),
  }
}

/** Uma linha curta pro placar: as contagens e quantas máquinas em cada status. */
export function resumoDoRetrato(r: Retrato): string {
  const porStatus = new Map<string, number>()
  for (const m of Object.values(r.maquinas)) {
    porStatus.set(m.status, (porStatus.get(m.status) ?? 0) + 1)
  }
  return [
    ...Object.entries(r.contagens).map(([k, v]) => `${k}=${v}`),
    `máquinas: ${[...porStatus].map(([s, n]) => `${n} ${s}`).join(', ')}`,
  ].join(', ')
}

/** As divergências entre os dois retratos, uma frase por linha. */
export function divergencias(antes: Retrato, depois: Retrato): string[] {
  const erros: string[] = []
  for (const chave of Object.keys(antes.contagens)) {
    if (antes.contagens[chave] !== depois.contagens[chave]) {
      erros.push(
        `${chave}: ${antes.contagens[chave]} antes, ${depois.contagens[chave]} depois`,
      )
    }
  }
  if (depois.contagens.linhas_com_a_marca !== 0) {
    erros.push(
      `${depois.contagens.linhas_com_a_marca} linha(s) com a marca do teste no banco`,
    )
  }
  const ids = new Set([...Object.keys(antes.maquinas), ...Object.keys(depois.maquinas)])
  for (const id of ids) {
    const a = antes.maquinas[id]
    const d = depois.maquinas[id]
    if (a?.status !== d?.status) {
      erros.push(
        `máquina ${(a ?? d).codigo}: ${a?.status ?? 'não existia'} antes, ` +
          `${d?.status ?? 'sumiu'} depois`,
      )
    }
  }
  return erros
}
