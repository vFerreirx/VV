import 'server-only'

import { and, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'

import { ordensProducao } from '@/lib/db/schema'
import { ANTES_DA_CONCLUSAO } from '@/lib/producao/transicoes-da-op'

// ⚠️ A CÓPIA EM SQL DE `producaoAtrasada` (src/lib/producao/atraso-da-op.ts),
// pras contagens que acontecem no banco. Leia a regra e o porquê lá: atrasada
// é a PRODUÇÃO que não foi concluída, não a OP sem baixa.
//
// A lista de status é a MESMA constante importada, nunca redigitada — se um
// status novo entrar em `ANTES_DA_CONCLUSAO`, as duas cópias mudam juntas.
export function condicaoDeProducaoAtrasada(): SQL {
  return and(
    inArray(ordensProducao.status, [...ANTES_DA_CONCLUSAO]),
    isNotNull(ordensProducao.dataPrevistaFim),
    sql`${ordensProducao.dataPrevistaFim} < now()`,
  )!
}
