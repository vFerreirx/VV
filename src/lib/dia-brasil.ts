// O DIA DA CASA É O DE BRASÍLIA, NÃO O DO SERVIDOR.
//
// Na Vercel o processo roda em UTC, então `new Date().getDate()` vira o dia
// seguinte às 21h de Brasília. Pra qualquer coisa que responda "isso é de
// hoje?" isso é um bug de três horas por noite: uma diária marcada 21h30
// contaria como feita amanhã, e a lista do dia zeraria antes do expediente
// acabar.
//
// Este arquivo é a fonte ÚNICA da conversão. É lógica pura, sem banco e sem
// React, e roda igual nos dois lados: no servidor porque o fuso do processo
// não entra na conta, e no cliente porque o fuso do navegador também não —
// quem abrir o sistema de outro estado (ou com o relógio do computador
// errado) vê o mesmo dia que a casa.
//
// A REGRA MORA AQUI E SÓ AQUI. Não repita `AT TIME ZONE` em SQL: quem lê o
// banco recebe o timestamptz cru (instante absoluto, sem ambiguidade) e
// pergunta a este arquivo de que dia ele é. Duas cópias da regra de fuso
// divergem no dia que alguma delas for mexida, e divergem só de noite —
// o pior tipo de bug pra alguém notar.

export const FUSO_BRASIL = 'America/Sao_Paulo'

// `formatToParts` em vez de `toLocaleDateString('en-CA')`: o formato de
// 'en-CA' até é YYYY-MM-DD, mas depende de qual base de locales o runtime
// empacotou. Montando as partes à mão, o formato é nosso.
const PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_BRASIL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// 'YYYY-MM-DD' do instante, no fuso de Brasília.
export function diaEmBrasilia(instante: Date): string {
  const partes = PARTES.formatToParts(instante)
  const pega = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)!.value
  return `${pega('year')}-${pega('month')}-${pega('day')}`
}

export function hojeEmBrasilia(): string {
  return diaEmBrasilia(new Date())
}

// O instante caiu no dia informado? É a pergunta "foi feita hoje?" — com o
// `hoje` vindo de fora, pra toda a requisição usar o MESMO dia. Duas
// chamadas a `hojeEmBrasilia()` podem cair em dias diferentes se a
// requisição atravessar a meia-noite.
export function ehDoDia(instante: Date | null, dia: string): boolean {
  return instante !== null && diaEmBrasilia(instante) === dia
}

// -----------------------------------------------------------------
// Dia da semana
// -----------------------------------------------------------------
//
// 0=domingo, igual ao `getDay()` do JavaScript e ao `EXTRACT(DOW)` do
// Postgres. Os três concordam de propósito: `tarefas_diarias.dias_semana`
// guarda esses mesmos números e não há conversão em lugar nenhum.

// Derivado do TEXTO 'YYYY-MM-DD', e não do token `weekday` do Intl: o token
// devolve um NOME, que precisaria ser traduzido de volta pra número por uma
// tabela dependente de locale. A data já vem sem hora e sem fuso, então
// meia-noite UTC responde certo — é a mesma técnica do `emUTC` em
// src/lib/validators/tarefas.ts.
export function diaDaSemana(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano!, mes! - 1, dia!)).getUTCDay()
}

export function diaDaSemanaHoje(): number {
  return diaDaSemana(hojeEmBrasilia())
}

export const DIA_SEMANA_LABEL = [
  'Dom',
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
] as const

export const DIA_SEMANA_NOME = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const

export const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6]

// Texto curto pra lista: "todo dia", "seg a sex", ou os dias soltos.
export function resumoDeDias(dias: readonly number[]): string {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b)
  if (ordenados.length === 7) return 'todo dia'
  if (ordenados.join() === '1,2,3,4,5') return 'seg a sex'
  if (ordenados.join() === '0,6') return 'fim de semana'
  return ordenados.map((d) => DIA_SEMANA_LABEL[d]).join(', ')
}

// Hora do instante em Brasília, pro "feita por Fulano às HH:mm". Mesmo fuso
// do dia: se o dia é o de Brasília, a hora ao lado dele não pode ser a do
// navegador, senão as duas se contradizem na mesma frase.
const HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_BRASIL,
  hour: '2-digit',
  minute: '2-digit',
})

export function horaEmBrasilia(instante: Date): string {
  return HORA.format(instante)
}
