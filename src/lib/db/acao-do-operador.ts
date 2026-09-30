import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { maquinas } from '@/lib/db/schema'

// -----------------------------------------------------------------
// A regra de AÇÃO do operador
// -----------------------------------------------------------------
//
// O OPERADOR NÃO PERTENCE A ESTAÇÃO NENHUMA. A estação é do TABLET — o lugar
// do aparelho na fábrica (src/lib/auth/estacao-do-aparelho.ts) —, e ela só
// organiza a tela. Prender operador a estação não funcionava no chão: no
// almoço um cobre a máquina do outro do outro lado do galpão, de madrugada
// eles revezam por horário, e não há gerente acordado pra refazer vínculo. O
// Bruno cobrindo a Máquina 10 nem aparecia no "Quem é você?" do tablet dela, e o
// registro saía no nome de quem estava logado.
//
// Então ele age em QUALQUER OP que está numa máquina, de qualquer estação e
// de qualquer tablet, e enxerga a fábrica inteira. Quem fez cada coisa é o
// PIN que diz (src/lib/auth/pin.ts). O "Você está cobrindo?" do tablet
// (src/lib/producao/cobertura.ts) é confirmação de tela, e o servidor não
// recusa por estação em lugar nenhum.
//
// ⚠️ A tabela `estacao_operadores` ficou no banco com os vínculos antigos, e
// NINGUÉM lê nem grava mais nela. Não volte a consultá-la esperando que diga
// onde o operador pode agir. (As policies RLS das migrations 56 e 57 ainda a
// citam; o app não passa por elas — grava pelo Drizzle, na conexão direta —,
// e alinhá-las é uma migration combinada à parte.)

export type PermissaoDoOperador = { pode: true } | { pode: false; erro: string }

/**
 * O operador age em qualquer OP que ESTÁ NUMA MÁQUINA viva — não só na que
 * ele pegou, e não só nas de um grupo de máquinas. Ao agir, ele vira o
 * responsável (ver `assumiu` nas actions).
 *
 * OP sem máquina é recusada de propósito, e é a regra que sobrou: ela fecha a
 * porta dos fundos entre a fila e a produção. Sem esta recusa, o operador
 * arrastaria uma OP da fila direto pra 'em_producao' pelo kanban e ela
 * entraria em produção sem máquina nenhuma, furando o "escolher máquina é
 * obrigatório".
 *
 * Só vale pra `role === 'operador'`. Admin e gerente não passam por aqui.
 */
export async function operadorPodeAgirNaOrdem(
  ordemMaquinaId: string | null,
): Promise<PermissaoDoOperador> {
  if (!ordemMaquinaId) {
    return {
      pode: false,
      erro: 'Essa OP ainda não tem máquina. Use "Pegar pra mim" pra escolher uma e começar.',
    }
  }
  const [maquina] = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.id, ordemMaquinaId), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!maquina) {
    return { pode: false, erro: 'A máquina desta OP foi excluída. Fale com o gerente.' }
  }
  return { pode: true }
}
