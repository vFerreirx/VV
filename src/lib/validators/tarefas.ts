import { z } from 'zod'

// ⚠️ IMPORTS RELATIVOS, e não pelo alias `@/`: as regras deste arquivo têm
// teste que roda no runner do Node (`node --test
// --experimental-strip-types src/lib/producao/regras.test.ts`), e o Node cru
// não resolve o alias do tsconfig nem completa extensão — daí o `.ts` no
// fim, que o `allowImportingTsExtensions` do tsconfig já permite e o
// bundler do Next entende. Os dois módulos abaixo são puros, sem banco e sem
// React, então a cadeia inteira carrega no runner.
import { diaEmBrasilia, diasEntre, hojeEmBrasilia } from '../dia-brasil.ts'
import {
  PRIORIDADE_NIVEIS,
  ehDestaque,
  maiorPrioridade,
  type PrioridadeAlerta,
  type PrioridadeNivel,
} from '../prioridade.ts'

// Tarefa da administração. Só o título é obrigatório — o caminho rápido de
// criação é digitar o título e salvar; prazo e conta são secundários e a
// maioria das tarefas nasce sem eles.
export const tarefaSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(2, 'Título muito curto')
    .max(160, 'Título muito longo'),

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
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'Data inválida',
    ),

  contaId: z
    .union([z.uuid('Conta inválida'), z.null(), z.undefined()])
    .transform((v) => v ?? null),
})

export type TarefaInput = z.input<typeof tarefaSchema>
export type TarefaData = z.output<typeof tarefaSchema>

// Vencida = prazo anterior a hoje. Comparação em texto YYYY-MM-DD de
// propósito: `prazo` é `date` (sem hora nem fuso) e virar Date aqui traria
// o fuso do servidor junto, fazendo a tarefa vencer cedo ou tarde demais.
//
// O "HOJE" É O DE BRASÍLIA, e não o do relógio de quem pergunta. Isto já
// montou a data com o fuso LOCAL, e o local é diferente nos dois lados:
//
//   - no servidor da Vercel é UTC, então das 21h à meia-noite ele já
//     achava que era amanhã. A escalada por prazo acontecia uma noite
//     adiantada (tarefa pra daqui a 3 dias virava Urgente às 21h da
//     véspera) e `estaVencida` marcava vencida às 21h do próprio dia do
//     prazo;
//   - no navegador é o fuso do computador de quem abriu — que por acaso
//     estava certo aqui, e deixaria de estar pra quem abrisse de outro
//     estado ou com o relógio errado.
//
// Ou seja: das 21h à meia-noite o selo escalado (calculado no servidor) e o
// vermelho de "venceu" (calculado na tela) podiam se contradizer na MESMA
// linha. Agora os dois perguntam a mesma coisa a src/lib/dia-brasil.ts, que
// não depende do fuso de ninguém.
export function hojeISO(): string {
  return hojeEmBrasilia()
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

// Dias inteiros daqui até o prazo. Negativo = já venceu; 0 = vence hoje.
//
// A aritmética (meia-noite UTC dos dois lados, porque `prazo` é `date` sem
// hora nem fuso) saiu daqui pra `diasEntre` em src/lib/dia-brasil.ts, que já
// era dona de `somarDias` e fazia o mesmo truque. Ela ganhou um terceiro
// consumidor — as parcelas do pedido — e três cópias da mesma conta são três
// chances de discordarem sobre o que é "amanhã". A assinatura daqui fica: é
// o vocabulário de tarefa, e quem chama não precisa saber onde a conta mora.
export function diasAteOPrazo(prazo: string, hoje = hojeISO()): number {
  return diasEntre(hoje, prazo)
}

// Nível que a DATA sozinha pede. `baixa` é o piso — o menor nível que
// existe —, então "não escala nada" e "escala pra baixa" são a mesma coisa
// e `maiorPrioridade` nunca é enganado por uma tarefa sem prazo.
export function escalarPorPrazo(
  prazo: string | null,
  hoje = hojeISO(),
): PrioridadeNivel {
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

// -----------------------------------------------------------------
// O QUE ACENDE A BOLINHA DO MENU — e por que não é o mesmo que o SELO
// -----------------------------------------------------------------
//
// ⚠️ ESTA REGRA É, DE PROPÓSITO, DIFERENTE DE `prioridadeEfetiva`. Quem ler
// as duas lado a lado sem este comentário vai achar que uma delas está errada
// e "consertar" — não conserte.
//
//   SELO da lista  → `prioridadeEfetiva`: mostra "Alta" onde alguém marcou
//                    Alta. Continua igual, e continua ordenando a lista.
//   BOLINHA do menu → esta função: interrompe só por URGENTE marcado à mão e
//                    pela escalada por PRAZO.
//
// O motivo é o que aconteceu: 5 tarefas abertas estavam marcadas "alta" à
// mão, duas delas vencendo só em 30/09 e 02/10 e uma sem prazo nenhum — e a
// bolinha ficou acesa por semanas. A escalada por prazo foi desenhada pra
// evitar exatamente isso ("até uma semana: dá tempo de reagir sem a bolinha
// acesa o mês inteiro"), mas a alta marcada à mão nunca expira: ninguém volta
// numa tarefa pra rebaixá-la.
//
// Aviso que fica aceso o mês inteiro para de ser aviso. Urgente à mão
// continua interrompendo porque é a palavra que alguém escolheu para dizer
// "agora"; alta à mão vira o que ela é de fato — uma ordenação.
export function acendeOMenu(
  marcada: PrioridadeNivel,
  prazo: string | null,
  hoje = hojeISO(),
): PrioridadeAlerta {
  // Urgente à mão interrompe com ou sem prazo.
  if (marcada === 'urgente') return 'urgente'
  // O resto é só a data: alta/normal/baixa marcadas à mão não acendem nada
  // sozinhas.
  const doPrazo = escalarPorPrazo(prazo, hoje)
  return ehDestaque(doPrazo) ? doPrazo : null
}

// -----------------------------------------------------------------
// HÁ QUANTO TEMPO ESTÁ ABERTA
// -----------------------------------------------------------------
//
// 80% das tarefas não têm prazo (47 de 59), e exigir data faria inventar
// data — então o que responde "isso aqui empacou?" não é o prazo, é a idade.
//
// 21 DIAS, e o caminho até esse número importa. A primeira versão usou 14, o
// dobro da média de conclusão (6,3 dias) — mas essa média é das tarefas
// CONCLUÍDAS, ou seja, das rápidas: quem fica aberto é justamente o que
// demora, e comparar o aberto com a média do fechado marca quase tudo.
//
// Na medição de 21/09/2026, com as 15 abertas: 4 tinham 10 dias, 6 entre 14 e
// 20, 3 entre 21 e 29 e 2 mais de 30. Com 14, o selo acendia em 11 das 15 —
// e selo que aparece em quase toda linha não distingue nada. Com 21, marca 5.
//
// ⚠️ ISTO NUNCA ACENDE NADA NO MENU. É selo e filtro, dentro da tela de quem
// já foi olhar. Tarefa parada não é urgência — é justamente o contrário: o
// que ficou sem urgência nenhuma.
export const DIAS_PARA_PARADA = 21

/**
 * Dias inteiros desde a criação até hoje. 0 = criada hoje.
 *
 * ⚠️ O "hoje" é o de Brasília e vem DE FORA, calculado uma vez por
 * requisição no servidor — igual a `valeHoje` das diárias. Deixar a tela
 * chamar `new Date()` é o bug que src/lib/dia-brasil.ts existe pra matar.
 */
export function diasAberta(criadaEm: Date, hoje = hojeISO()): number {
  return Math.max(0, diasEntre(diaEmBrasilia(criadaEm), hoje))
}

/** Passou do dobro da média? Só faz sentido pra tarefa em aberto. */
export function estaParada(dias: number): boolean {
  return dias >= DIAS_PARA_PARADA
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

// -----------------------------------------------------------------
// Tarefa DIÁRIA
// -----------------------------------------------------------------
//
// Rotina que volta pendente todo dia. Só título, descrição e dias da
// semana: NÃO tem prazo nem prioridade, de propósito — ela não acende a
// bolinha do menu nem entra no painel, então não haveria nada pra um nível
// significar. Ver src/lib/db/schema/tarefas.ts e a migration 49.
export const tarefaDiariaSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(2, 'Título muito curto')
    .max(160, 'Título muito longo'),

  descricao: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : v.trim()))
    .refine((v) => v === null || v.length <= 2000, 'Descrição muito longa')
    .transform((v) => (v === '' ? null : v)),

  // 0=domingo (ver src/lib/dia-brasil.ts). O `transform` NORMALIZA — remove
  // repetidos e ordena — porque o CHECK do banco não consegue pegar
  // duplicata (Postgres não aceita subquery em CHECK) e porque a lista
  // ordenada é o que o resumo "Seg, Qua, Sex" espera ler.
  //
  // Vazio é ERRO, não "todos": diária que não vale em dia nenhum nunca
  // apareceria no bloco, e quem desmarcasse o último dia sem querer acharia
  // que a rotina sumiu. O padrão de todos os sete é a DEFAULT da coluna,
  // aplicada quando ninguém tocou no campo — coisa diferente de esvaziar.
  diasSemana: z
    .array(z.number().int().min(0, 'Dia inválido').max(6, 'Dia inválido'))
    .transform((dias) => [...new Set(dias)].sort((a, b) => a - b))
    .refine((dias) => dias.length > 0, 'Escolha pelo menos um dia da semana'),
})

// -----------------------------------------------------------------
// DIÁRIA AUTOMÁTICA
// -----------------------------------------------------------------
//
// Rotina cuja resposta o sistema já sabe, e que por isso não tem checkbox.
// Hoje é uma só: "Cadastrar vendas do dia anterior" — /vendas já cobra os
// dias sem lançamento desde o commit 7e15bc8, e pedir a marcação à mão seria
// manter duas verdades sobre o mesmo fato.
//
// ⚠️ ESTA TUPLA É ESPELHO DO CHECK do banco (migration 68). Chave nova entra
// nos dois lugares ou em nenhum — mesmo par que os motivos de parada.
export const DIARIAS_AUTOMATICAS = ['vendas_do_dia_anterior'] as const

export type DiariaAutomatica = (typeof DIARIAS_AUTOMATICAS)[number]

export function ehDiariaAutomatica(v: unknown): v is DiariaAutomatica {
  return (
    typeof v === 'string' &&
    (DIARIAS_AUTOMATICAS as readonly string[]).includes(v)
  )
}

export type TarefaDiariaInput = z.input<typeof tarefaDiariaSchema>
export type TarefaDiariaData = z.output<typeof tarefaDiariaSchema>
