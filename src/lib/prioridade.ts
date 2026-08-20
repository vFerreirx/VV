// Vocabulário de PRIORIDADE — um só pro sistema inteiro.
//
// O banco tem dois enums separados, de propósito (`ordem_prioridade` e
// `tarefa_prioridade`, ver supabase/sql/46_tarefa_prioridade.sql): tipo
// chamado "ordem" numa tabela de tarefas confunde pra sempre. Mas os NÍVEIS
// são os mesmos, e a leitura deles também tem que ser — quem reconhece
// "urgente" no kanban precisa reconhecer igual na tarefa. Por isso rótulo e
// cor moram aqui, e não copiados de tela em tela.
//
// A ORDEM importa: é a mesma dos dois enums no Postgres (baixa < normal <
// alta < urgente), o que faz `ORDER BY prioridade DESC` devolver urgente
// primeiro sem CASE nenhum.
//
// COR NÃO É A ÚNICA DIFERENÇA. O indicador do menu
// (src/components/layout/indicador-tarefas.tsx) separa alta de urgente por
// PREENCHIMENTO — anel vazado x disco cheio —, porque o pulso não roda com
// `prefers-reduced-motion` e laranja x vermelho é justamente o par que o
// daltonismo mais comum apaga.

export const PRIORIDADE_NIVEIS = ['baixa', 'normal', 'alta', 'urgente'] as const

export type PrioridadeNivel = (typeof PRIORIDADE_NIVEIS)[number]

// O que merece aviso. `null` = nada a mostrar; baixa/normal são o silêncio
// normal e nunca chegam aqui.
export type PrioridadeAlerta = Extract<PrioridadeNivel, 'alta' | 'urgente'> | null

export const PRIORIDADE_LABEL: Record<PrioridadeNivel, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

// Classes do <Badge>. Alta é laranja e urgente é `destructive` porque é
// assim que a OP já se apresenta no kanban, no painel e na lista de ordens.
export const PRIORIDADE_BADGE: Record<PrioridadeNivel, string> = {
  baixa: 'bg-muted text-muted-foreground',
  normal: 'bg-secondary text-secondary-foreground',
  alta: 'bg-orange-500/15 text-orange-600',
  urgente: 'bg-destructive/15 text-destructive',
}

// A MAIOR de duas prioridades, pela ordem de PRIORIDADE_NIVEIS. É o operador
// da escalada por prazo: a data pode SUBIR o nível de uma tarefa, nunca
// baixar — ver `prioridadeEfetiva` em src/lib/validators/tarefas.ts.
export function maiorPrioridade(
  a: PrioridadeNivel,
  b: PrioridadeNivel,
): PrioridadeNivel {
  return PRIORIDADE_NIVEIS.indexOf(a) >= PRIORIDADE_NIVEIS.indexOf(b) ? a : b
}

// Prioridade que vale a pena mostrar. Baixa e normal são o caso comum: um
// selo em cada linha vira ruído e o ruído esconde o urgente.
export function ehDestaque(p: PrioridadeNivel): p is NonNullable<PrioridadeAlerta> {
  return p === 'alta' || p === 'urgente'
}
