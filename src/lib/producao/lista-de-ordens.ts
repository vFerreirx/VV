// A LISTA DE /ORDENS LIDA NUM RELANCE — regra pura, sem banco.
//
// /ordens é o REGISTRO das OPs: a mais nova primeiro, 50 por página. A fila
// na ordem do operador mora no kanban e no tablet; aqui o gerente vem ver o
// que APERTA (atrasada, vence hoje) e achar uma OP. Este
// módulo decide como cada pedaço da linha se lê, reaproveitando as regras
// que o tablet já usa — `prazoEmPalavras` e `alertaDoBloco`
// (rotulo-da-op.ts), `producaoAtrasada` (atraso-da-op.ts). Não há uma segunda
// versão de nenhuma delas aqui; só o que é próprio da lista.

import type { StatusDaOrdem } from './destino-da-ordem'
import {
  DIA_SEMANA_LABEL,
  diaDaSemana,
  diaEmBrasilia,
  diasEntre,
} from '../dia-brasil.ts'
import { producaoAtrasada, producaoNaoConcluida } from './atraso-da-op.ts'
import {
  alertaDoBloco,
  prazoEmPalavras,
  type AlertaDoBloco,
  type Prazo,
} from './rotulo-da-op.ts'

// ─────────────────────────────────────────────────────────────────────────
// O PRAZO NA LINHA
// ─────────────────────────────────────────────────────────────────────────
//
// ⚠️ `prazoEmPalavras` SOZINHO MENTE AQUI. No tablet só aparece OP que ainda
// vai ser produzida; aqui aparece tudo, e uma OP concluída no prazo viraria
// "ATRASADA 3 dias" só porque o Full ainda não foi despachado — o mesmo erro
// que atraso-da-op.ts já corrigiu uma vez. Depois da conclusão o que falta é
// o DESPACHO, que é da remessa; o prazo da produção sai de cena.
//
// ⚠️ E O MESMO DIA TEM DOIS CASOS. `prazoEmPalavras` conta em dias de
// calendário, então um prazo das 8h de hoje, às 10h, diria "vence HOJE" —
// mas o contador de atrasadas (a cópia SQL de `producaoAtrasada`) já conta
// ela como atrasada. Linha e contador não podem discordar: aí vira "venceu
// HOJE", pintado como atraso. Na prática quase não acontece (o prazo
// gravado é o fim do dia, `prazoDaOp`), mas OP antiga tem hora qualquer.

export function prazoNaLista(
  status: StatusDaOrdem,
  prazo: Date | string | null,
  agora: Date = new Date(),
): Prazo | null {
  if (prazo === null || !producaoNaoConcluida(status)) return null
  const p = prazoEmPalavras(new Date(prazo), agora)
  if (p && p.texto === 'vence HOJE' && producaoAtrasada(status, prazo, agora)) {
    return { texto: 'venceu HOJE', urgente: true }
  }
  return p
}

// ─────────────────────────────────────────────────────────────────────────
// A QUANTIDADE — meta enquanto roda, resultado depois
// ─────────────────────────────────────────────────────────────────────────
//
// SEM BARRA NA LINHA, pelo mesmo motivo do tablet (painel-operador.tsx): a
// produção só é registrada na conclusão, então uma barra por OP ficaria em
// zero o turno inteiro e pularia pra cheia no fim. "30 pç" enquanto roda;
// "27/30 pç" e "2 com defeito" depois — por extenso: "2 ref." era abreviação
// que só quem escreveu entendia.
//
// ⚠️ "FALTOU" SÓ DEPOIS DA CONCLUSÃO. OP legada pode ter apontamento de antes
// dela, e "12/30" de uma OP ainda rodando não é falta — é andamento. Âmbar
// só quando a produção fechou abaixo da meta.

export type QuantidadeNaLista = {
  /** "30 pç" ou "27/30 pç". */
  texto: string
  /** "2 com defeito", ou null sem defeito. */
  refugo: string | null
  /** A produção terminou abaixo da meta — a tela pinta de âmbar. */
  faltou: boolean
}

export function quantidadeNaLista(o: {
  status: StatusDaOrdem
  quantidade: number
  produzido: number
  refugo: number
}): QuantidadeNaLista {
  // Zero e zero = nada registrado. "0/30" diria que a produção deu zero,
  // quando ela nem foi registrada.
  if (o.produzido === 0 && o.refugo === 0) {
    return { texto: `${o.quantidade} pç`, refugo: null, faltou: false }
  }
  return {
    texto: `${o.produzido}/${o.quantidade} pç`,
    refugo: o.refugo > 0 ? `${o.refugo} com defeito` : null,
    faltou: o.produzido < o.quantidade && !producaoNaoConcluida(o.status),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// O SEPARADOR POR DIA DE CRIAÇÃO
// ─────────────────────────────────────────────────────────────────────────
//
// A lista é ordenada pela criação, e uma importação de Full cria 30 OPs de
// uma vez. O separador mostra onde a leva começa e termina sem gastar
// coluna: "Hoje · 24/09", "Ontem · 23/09", "Esta semana" (de segunda até
// anteontem, num bloco só) e, antes disso, "qua · 16/09".
//
// ⚠️ NO DIA DE BRASÍLIA (`diaEmBrasilia`, src/lib/dia-brasil.ts), e não no
// do aparelho. A lista é montada no servidor (UTC) e de novo no navegador:
// com o fuso local, uma OP criada às 22h sairia "Ontem" num e "Hoje" no
// outro. O fuso vem de lá, que é a fonte única dele.
//
// ⚠️ NÃO REORDENA, como `agruparPorDestino`: só corta a sequência que chegou
// onde o rótulo muda. A ordem continua sendo a do SQL.

export function rotuloDoDia(criadaEm: Date | string, agora: Date = new Date()): string {
  const dia = diaEmBrasilia(new Date(criadaEm))
  const hoje = diaEmBrasilia(agora)
  const atras = diasEntre(dia, hoje)
  const [, mes, d] = dia.split('-')
  const ddmm = `${d}/${mes}`
  // Negativo só com relógio desencontrado: não inventa "amanhã" no registro.
  if (atras <= 0) return `Hoje · ${ddmm}`
  if (atras === 1) return `Ontem · ${ddmm}`
  // A semana começa na segunda: domingo (0) é o sétimo dia dela.
  const desdeSegunda = (diaDaSemana(hoje) + 6) % 7
  if (atras <= desdeSegunda) return 'Esta semana'
  return `${DIA_SEMANA_LABEL[diaDaSemana(dia)]} · ${ddmm}`
}

export type GrupoDoDia<T> = { rotulo: string; ops: T[] }

export function agruparPorDia<T extends { createdAt: Date | string }>(
  ops: readonly T[],
  agora: Date = new Date(),
): GrupoDoDia<T>[] {
  const grupos: GrupoDoDia<T>[] = []
  for (const op of ops) {
    const rotulo = rotuloDoDia(op.createdAt, agora)
    const ultimo = grupos.at(-1)
    if (ultimo && ultimo.rotulo === rotulo) ultimo.ops.push(op)
    else grupos.push({ rotulo, ops: [op] })
  }
  return grupos
}

// ─────────────────────────────────────────────────────────────────────────
// O RESUMO DO DESTINO FILTRADO — a faixa do Full ou do pedido
// ─────────────────────────────────────────────────────────────────────────
//
// Com um Full (ou um pedido) filtrado, a pergunta muda de "qual OP?" pra
// "como está esse Full?". A faixa responde com o destino INTEIRO — todas as
// OPs dele, não só as da página nem só as abertas: uma OP despachada também
// é peça que já saiu pro Full.
//
// - CANCELADA NÃO CONTA em nada: não é meta, não é peça, não é status.
// - A BARRA É DE PEÇAS SOBRE A META, e aqui ela mede algo real: com dez OPs,
//   cada conclusão anda a barra — o que não acontece numa OP sozinha.
// - O AVISO é o `alertaDoBloco` do tablet, o mesmo cabeçalho do bloco de
//   destino — mas só com a produção NÃO CONCLUÍDA, pelo mesmo motivo do
//   `prazoNaLista`: OP concluída não atrasa.

export type OpDoResumo = {
  status: StatusDaOrdem
  quantidade: number
  produzido: number
  dataPrevistaFim: Date | string | null
  prioridade: string
}

export type ResumoDoDestino = {
  /** OPs não canceladas. */
  total: number
  porStatus: Partial<Record<StatusDaOrdem, number>>
  produzido: number
  meta: number
  alerta: AlertaDoBloco
}

export function resumoDoDestino(
  ops: readonly OpDoResumo[],
  agora: Date = new Date(),
): ResumoDoDestino {
  const vivas = ops.filter((o) => o.status !== 'cancelado')
  const porStatus: Partial<Record<StatusDaOrdem, number>> = {}
  let produzido = 0
  let meta = 0
  for (const o of vivas) {
    porStatus[o.status] = (porStatus[o.status] ?? 0) + 1
    produzido += o.produzido
    meta += o.quantidade
  }
  const emProducao = vivas
    .filter((o) => producaoNaoConcluida(o.status))
    .map((o) => ({
      dataPrevistaFim: o.dataPrevistaFim === null ? null : new Date(o.dataPrevistaFim),
      prioridade: o.prioridade,
    }))
  return {
    total: vivas.length,
    porStatus,
    produzido,
    meta,
    alerta: alertaDoBloco(emProducao, agora),
  }
}
