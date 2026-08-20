import { z } from 'zod'

import { PRIORIDADE_NIVEIS, maiorPrioridade, type PrioridadeNivel } from '@/lib/prioridade'

// Tarefa da administração. Só o título é obrigatório — o caminho rápido de
// criação é digitar o título e salvar; prazo e conta são secundários e a
// maioria das tarefas nasce sem eles.
export const tarefaSchema = z.object({
  titulo: z.string().trim().min(2, 'Título muito curto').max(160, 'Título muito longo'),

  descricao: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : v.trim()))
    .refine((v) => v === null || v.length <= 2000, 'Descrição muito longa')
    .transform((v) => (v === '' ? null : v)),

  // Mesmos quatro níveis da OP (enum próprio no banco, ver
  // supabase/sql/46_tarefa_prioridade.sql). `.default('normal')` deixa o
  // campo opcional na ENTRADA: o caminho rápido continua sendo título +
  // Enter, e quem não escolhe nada cai em normal — igual às tarefas antigas.
  prioridade: z.enum(PRIORIDADE_NIVEIS).default('normal'),

  prazo: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida'),

  contaId: z.union([z.uuid('Conta inválida'), z.null(), z.undefined()]).transform((v) => v ?? null),
})

export type TarefaInput = z.input<typeof tarefaSchema>
export type TarefaData = z.output<typeof tarefaSchema>

// Vencida = prazo anterior a hoje. Comparação em texto YYYY-MM-DD de
// propósito: `prazo` é `date` (sem hora nem fuso) e virar Date aqui traria
// o fuso do servidor junto, fazendo a tarefa vencer cedo ou tarde demais.
export function hojeISO(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

export function estaVencida(prazo: string | null): boolean {
  return prazo !== null && prazo < hojeISO()
}

// -----------------------------------------------------------------
// Escalada por prazo — A REGRA, e ela mora SÓ AQUI
// -----------------------------------------------------------------
//
// A prioridade que a pessoa escolhe é INTENÇÃO e fica gravada como está. O
// prazo chegando não reescreve nada no banco: a prioridade EFETIVA é
// recalculada na leitura, toda vez. É o mesmo raciocínio do peso x preço
// (ver src/lib/peso.ts): corrigir um prazo tem que valer na hora, e uma
// tarefa não pode continuar urgente porque um cron passou por ela ontem.
//
// A ESCALADA SÓ SOBE. `prioridadeEfetiva` é o MAIOR entre o marcado à mão e
// o derivado da data. Urgente marcado à mão continua urgente com prazo pra
// daqui a um mês, ou sem prazo nenhum — se a data pudesse rebaixar, o
// sistema estaria discordando de quem marcou, em silêncio.
//
// NÃO DUPLIQUE ISTO EM SQL. O menu não lê a lista inteira: ele pede ao banco
// só dois fatos crus (o maior nível marcado e o prazo mais próximo) e aplica
// esta mesma função em cima — ver src/lib/db/tarefas.ts. Uma cópia da regra
// num ORDER BY faria o menu e a tela discordarem no dia que os prazos
// mudassem, e ninguém veria acontecer.

// Vencida, vence hoje, amanhã ou depois de amanhã.
export const DIAS_PARA_URGENTE = 2
// Até uma semana: dá tempo de reagir sem a bolinha acesa o mês inteiro.
export const DIAS_PARA_ALTA = 7

// Meia-noite UTC dos dois lados: `prazo` é `date` (sem hora nem fuso) e a
// diferença tem que ser um número inteiro de dias, sem horário de verão nem
// o fuso do servidor entrando na conta.
function emUTC(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return Date.UTC(ano!, mes! - 1, dia!)
}

// Dias inteiros daqui até o prazo. Negativo = já venceu; 0 = vence hoje.
export function diasAteOPrazo(prazo: string, hoje = hojeISO()): number {
  return Math.round((emUTC(prazo) - emUTC(hoje)) / 86_400_000)
}

// Nível que a DATA sozinha pede. `baixa` é o piso — o menor nível que
// existe —, então "não escala nada" e "escala pra baixa" são a mesma coisa
// e `maiorPrioridade` nunca é enganado por uma tarefa sem prazo.
export function escalarPorPrazo(prazo: string | null, hoje = hojeISO()): PrioridadeNivel {
  if (prazo === null) return 'baixa'
  const dias = diasAteOPrazo(prazo, hoje)
  if (dias <= DIAS_PARA_URGENTE) return 'urgente'
  if (dias <= DIAS_PARA_ALTA) return 'alta'
  return 'baixa'
}

// O que a tarefa É agora: o maior entre o que marcaram e o que a data pede.
export function prioridadeEfetiva(
  marcada: PrioridadeNivel,
  prazo: string | null,
  hoje = hojeISO(),
): PrioridadeNivel {
  return maiorPrioridade(marcada, escalarPorPrazo(prazo, hoje))
}

// A data subiu o nível por conta própria? Serve pra tela não deixar parecer
// que alguém marcou "Urgente" numa tarefa que ninguém tocou.
export function escalouSozinha(
  marcada: PrioridadeNivel,
  prazo: string | null,
  hoje = hojeISO(),
): boolean {
  return prioridadeEfetiva(marcada, prazo, hoje) !== marcada
}
