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
//
// ⚠️ EXCEÇÃO ÚNICA E SANCIONADA: agrupar por dia DENTRO do SQL.
//
// O gráfico de produção do dashboard soma apontamentos por dia. Trazer as
// linhas cruas pra agrupar aqui funcionaria, mas o custo cresce com a
// fábrica enquanto a agregação no banco fica em 14 linhas pra sempre. Então
// `listarProducaoUltimosDias` (src/app/(app)/dashboard/actions.ts) usa
// `AT TIME ZONE` — e é o ÚNICO lugar que pode.
//
// O que torna isso seguro é a condição de sempre: o fuso é IMPORTADO daqui
// (`FUSO_BRASIL`), nunca redigitado no SQL. O nome do fuso existe uma vez só
// no repositório, então não sobra o que divergir — Postgres e ICU leem a
// mesma tzdata. Exceção nova segue a mesma condição, ou não entra.
//
// O que continua PROIBIDO, e é diferente: mexer no `TimeZone` da SESSÃO do
// Postgres. Ele é UTC e há código que depende disso — `ordens.data_prevista_fim`
// é timestamptz que só recebe texto 'YYYY-MM-DD', gravado em meia-noite UTC
// e lido de volta com `getUTC*` em src/app/(app)/calendario/actions.ts. Virar
// a sessão pra 'America/Sao_Paulo' mudaria a GRAVAÇÃO dos prazos novos e os
// dessincronizaria dos antigos, sem erro nenhum.

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
  const pega = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)!.value
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
// O caminho de volta: do dia para o INSTANTE
// -----------------------------------------------------------------
//
// Tudo acima LÊ um instante e responde de que dia ele é. Isto aqui faz o
// contrário: recebe 'YYYY-MM-DD' e devolve o instante em que aquele dia
// COMEÇOU em Brasília. Serve pra montar janela de consulta — "OPs criadas
// neste mês" é `>= inicioDoDiaEmBrasilia('2026-08-01')`, e não
// `new Date(); setDate(1); setHours(0,0,0,0)`, que em UTC dá 21h do dia 31
// do mês ANTERIOR e enfia três horas do mês passado na conta.
//
// O OFFSET É DERIVADO DA tzdata, NÃO É -03:00 CRAVADO. O Brasil não tem
// horário de verão desde o Decreto 9.772/2019, então -03:00 fixo acertaria
// hoje e é mais curto de escrever. Não é o que está aqui, de propósito: a
// leitura logo acima usa `Intl` (tzdata do runtime), e um escritor de offset
// fixo ao lado de um leitor tzdata é exatamente a divergência que o
// cabeçalho deste arquivo proíbe. Se o horário de verão voltar — e é decreto,
// não lei da física —, `diaEmBrasilia` acompanha sozinho e o offset fixo não,
// e os dois passariam quatro meses por ano se contradizendo. Derivando, a
// tzdata é a fonte única dos dois lados e não há premissa pra envelhecer.

const PARTES_COM_HORA = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_BRASIL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // Sem isso a meia-noite sai como '24' em alguns runtimes.
  hourCycle: 'h23',
})

// Quanto o relógio de Brasília estava adiantado/atrasado em relação ao UTC
// NAQUELE instante (negativo a oeste de Greenwich). Truque: formata o
// instante no fuso, remonta as partes como se fossem UTC, e a diferença pro
// instante original é o offset.
function offsetEmMs(instante: Date): number {
  const partes = PARTES_COM_HORA.formatToParts(instante)
  const pega = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)!.value)
  const comoSeFosseUTC = Date.UTC(
    pega('year'),
    pega('month') - 1,
    pega('day'),
    pega('hour'),
    pega('minute'),
    pega('second'),
  )
  // As partes têm resolução de segundo; trunca o instante pra comparar igual.
  return comoSeFosseUTC - Math.floor(instante.getTime() / 1000) * 1000
}

// Primeiro instante do dia informado, em Brasília.
//
// Duas passadas porque o offset a aplicar é o do RESULTADO, não o do palpite,
// e nos dois lados de uma virada de horário de verão eles diferem. Nem
// sempre convergem, e é por isso que a escolha final é explícita:
//
// - dia normal: as duas passadas dão o mesmo instante;
// - buraco (o verão começava À MEIA-NOITE, então 00:00 daquele dia NÃO
//   EXISTIU): uma das passadas cai no dia anterior. Por isso só entram
//   candidatos que de fato caem no dia pedido — o primeiro instante do dia
//   passa a ser 01:00, o momento da virada, que é a resposta certa;
// - volta do relógio (o verão terminava À MEIA-NOITE, repetindo a hora
//   ANTERIOR): a meia-noite em si acontece uma vez só, e a passada que usa o
//   offset velho aponta pra 23h do dia anterior — de novo, filtrar por dia
//   descarta ela.
//
// "Menor candidato válido" resolve os três: o filtro tira o candidato que caiu
// no dia errado, e o `min` desempata caso um fuso qualquer chegue a repetir a
// própria meia-noite. Se nenhum valer, o maior é o mais próximo — não há
// entrada real que caia aí, mas a função não devolve lixo.
export function inicioDoDiaEmBrasilia(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const meiaNoiteComoUTC = Date.UTC(ano!, mes! - 1, dia!)

  const primeiro = meiaNoiteComoUTC - offsetEmMs(new Date(meiaNoiteComoUTC))
  const segundo = meiaNoiteComoUTC - offsetEmMs(new Date(primeiro))

  const validos = [primeiro, segundo]
    .filter((t) => diaEmBrasilia(new Date(t)) === iso)
    .sort((a, b) => a - b)

  return new Date(validos[0] ?? Math.max(primeiro, segundo))
}

// Aritmética de CALENDÁRIO, sem fuso nenhum: 'YYYY-MM-DD' mais/menos N dias.
// A data não tem hora, então meia-noite UTC responde certo dos dois lados —
// mesma técnica do `diaDaSemana` logo abaixo. `Date.UTC` já normaliza dia 0
// e dia 32, então virada de mês e de ano saem de graça.
//
// Não confunda com `inicioDoDiaEmBrasilia`: aqui entra texto e sai texto, e
// o resultado é o mesmo em qualquer servidor. Só vire instante no fim, se
// precisar de um.
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(ano!, mes! - 1, dia! + dias))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
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

export const DIA_SEMANA_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

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
