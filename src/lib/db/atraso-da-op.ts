import 'server-only'

import { and, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm'

import { ordensProducao } from '@/lib/db/schema'
import { ANTES_DA_CONCLUSAO } from '@/lib/producao/transicoes-da-op'

// ⚠️ A CÓPIA EM SQL DE `producaoAtrasada` (src/lib/producao/atraso-da-op.ts),
// pras contagens que acontecem no banco. Leia a regra e o porquê lá: atrasada
// é a PRODUÇÃO que não foi concluída, não a OP não finalizada.
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

// VENCE HOJE, pro contador de /ordens: produção não concluída e prazo entre
// AGORA e o fim do dia de Brasília. É a contraparte SQL do "vence HOJE" de
// `prazoNaLista` (src/lib/producao/lista-de-ordens.ts).
//
// ⚠️ `>= now()` e não "o dia é hoje": o que já passou das horas é atrasada
// (`condicaoDeProducaoAtrasada`), e a mesma OP não pode entrar nos dois
// contadores — a linha diz "venceu HOJE" pra ela, pintada como atraso.
//
// ⚠️ O FIM DO DIA VEM DE FORA, como instante (`inicioDoDiaEmBrasilia` de
// amanhã, src/lib/dia-brasil.ts), e não de um `AT TIME ZONE` aqui: o fuso
// mora naquele arquivo e só lá.
export function condicaoDeProducaoVenceHoje(fimDeHoje: Date): SQL {
  return and(
    inArray(ordensProducao.status, [...ANTES_DA_CONCLUSAO]),
    isNotNull(ordensProducao.dataPrevistaFim),
    sql`${ordensProducao.dataPrevistaFim} >= now()`,
    lt(ordensProducao.dataPrevistaFim, fimDeHoje),
  )!
}
