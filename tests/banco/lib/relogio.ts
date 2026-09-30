// O TEMPO PASSA ENTRE UMA AÇÃO E OUTRA.
//
// Dentro de uma transação o `now()` é o mesmo pra tudo: toda linha que as
// actions gravam nasce no mesmo instante. Só que o desfazer, a "conclusão
// mais recente" e a "última transição" (src/lib/db/conclusao-da-op.ts) se
// decidem por `created_at` — com tudo empatado, a conclusão refeita e a
// desfeita seriam a mesma. Então, entre uma ação e outra, o que o teste já
// gravou RECUA. Dentro de uma mesma action tudo fica no mesmo instante,
// igual à produção.
//
// ⚠️ E O RELÓGIO DESTE COMPUTADOR NÃO É O DO BANCO. O app grava parte dos
// horários com `new Date()` (relógio local) e parte com `now()` (relógio do
// banco). Em 30/09 o computador estava 80 s ATRASADO: a parada abria com o
// `now()` do banco e fechava com o `new Date()` local, ANTES de abrir, e o
// `maquina_paradas_intervalo_ck` recusava. Por isso o recuo é de
// max(5 min, 2 × a diferença), e empurra também o início das paradas que o
// teste abriu. Na Vercel os dois relógios batem; aqui, não dá pra contar.

import { and, inArray, notInArray, sql } from 'drizzle-orm'

import {
  apontamentosProducao,
  eventosKanban,
  maquinaParadas,
  movimentacoesEstoque,
} from '@/lib/db/schema'

import type { Banco, Tx } from './conexao'

/** Acima disto o aviso aparece: o recuo cobre, mas o relógio está errado. */
const AVISO_MS = 60_000
const RECUO_MINIMO_MS = 5 * 60_000

/**
 * Quanto o relógio do BANCO está à frente deste computador, em ms (negativo:
 * atrás). Mede no meio da ida e volta, e imprime.
 */
export async function medirRelogio(db: Banco): Promise<number> {
  const antes = Date.now()
  const [linha] = await db.execute<{ agora: string }>(
    sql`SELECT (extract(epoch FROM clock_timestamp()) * 1000)::text AS agora`,
  )
  const depois = Date.now()
  const diferenca = Math.round(Number(linha.agora) - (antes + depois) / 2)

  const s = (Math.abs(diferenca) / 1000).toFixed(1)
  const lado =
    diferenca >= 0 ? 'atrasado em relação ao banco' : 'adiantado em relação ao banco'
  console.log(`relógio deste computador: ${s} s ${lado}`)
  if (Math.abs(diferenca) > AVISO_MS) {
    console.log(
      '\n⚠️  O RELÓGIO DESTE COMPUTADOR ESTÁ ERRADO (mais de 60 s).\n' +
        '   O teste compensa, mas o app gravaria horários tortos daqui.\n' +
        '   Pra acertar no Windows: Configurações → Hora e idioma → Data e\n' +
        '   hora → ligue "Definir hora automaticamente" e clique em\n' +
        '   "Sincronizar agora". Ou, num terminal de administrador:\n' +
        '       w32tm /resync\n',
    )
  }
  return diferenca
}

/** O recuo entre uma ação e outra, em ms. */
export function recuoPara(diferencaMs: number): number {
  return Math.max(RECUO_MINIMO_MS, 2 * Math.abs(diferencaMs))
}

export type DoTeste = {
  opIds: readonly string[]
  /** As máquinas em que o teste pode abrir parada. */
  maquinaIds: readonly string[]
  /** As paradas que já existiam nessas máquinas antes do teste: não mexe. */
  paradasDeAntes: readonly string[]
}

/** As paradas que já existiam nas máquinas do teste — ver `DoTeste`. */
export async function paradasExistentes(
  tx: Tx,
  maquinaIds: readonly string[],
): Promise<string[]> {
  if (maquinaIds.length === 0) return []
  const rows = await tx
    .select({ id: maquinaParadas.id })
    .from(maquinaParadas)
    .where(inArray(maquinaParadas.maquinaId, [...maquinaIds]))
  return rows.map((r) => r.id)
}

export async function passarTempo(tx: Tx, recuoMs: number, doTeste: DoTeste) {
  const recuo = sql.raw(`interval '${Math.round(recuoMs)} milliseconds'`)
  const ids = [...doTeste.opIds]
  if (ids.length > 0) {
    await tx
      .update(eventosKanban)
      .set({ createdAt: sql`${eventosKanban.createdAt} - ${recuo}` })
      .where(inArray(eventosKanban.ordemId, ids))
    await tx
      .update(apontamentosProducao)
      .set({ createdAt: sql`${apontamentosProducao.createdAt} - ${recuo}` })
      .where(inArray(apontamentosProducao.ordemId, ids))
    await tx
      .update(movimentacoesEstoque)
      .set({ createdAt: sql`${movimentacoesEstoque.createdAt} - ${recuo}` })
      .where(inArray(movimentacoesEstoque.referenciaId, ids))
  }

  // Só o INÍCIO das paradas do teste recua. O fim é o `new Date()` local do
  // "Voltou", que ainda vai acontecer: recuar o início é o que garante fim
  // depois do início, com o relógio daqui atrasado até metade do recuo.
  // Parada já encerrada recua inteira, pra não inverter o intervalo.
  if (doTeste.maquinaIds.length > 0) {
    const naoEraDeAntes =
      doTeste.paradasDeAntes.length > 0
        ? notInArray(maquinaParadas.id, [...doTeste.paradasDeAntes])
        : undefined
    await tx
      .update(maquinaParadas)
      .set({
        iniciadaEm: sql`${maquinaParadas.iniciadaEm} - ${recuo}`,
        encerradaEm: sql`${maquinaParadas.encerradaEm} - ${recuo}`,
      })
      .where(
        and(inArray(maquinaParadas.maquinaId, [...doTeste.maquinaIds]), naoEraDeAntes),
      )
  }
}
