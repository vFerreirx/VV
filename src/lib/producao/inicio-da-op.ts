// QUAIS OPs PODEM ENTRAR NUMA MÁQUINA — regra pura, sem banco.
//
// Terceiro irmão de `estado-maquina.ts` (o que o cartão mostra) e
// `destino-da-ordem.ts` (onde a OP aparece na tela). Este responde a
// pergunta do toque em "Iniciar produção": esta OP pode começar agora?
//
// ⚠️ FONTE ÚNICA, e é o ponto do arquivo. A lista que a consulta MOSTRA e a
// regra que a action ACEITA têm que ser a mesma coisa. Quando eram duas —
// um filtro no `listarOpsParaIniciar` e um `if` no `pegarOrdemAction` —
// bastava uma delas mudar pra tela oferecer o que o servidor recusa (toque
// que só devolve erro) ou, pior, pro servidor aceitar o que a tela nunca
// mostraria (porta dos fundos por chamada direta à action).
//
// ─────────────────────────────────────────────────────────────────────────
// AGUARDANDO MATÉRIA-PRIMA É JULGAMENTO HUMANO, NÃO DADO
// ─────────────────────────────────────────────────────────────────────────
//
// Não existe ligação nenhuma entre estoque de fio e OP: `lotes_fio` e
// `movimentacoes_fio` (src/lib/db/schema/fios.ts) não têm `ordem_id` nem
// referência a OP — `movimentacoes_fio.motivo` é texto livre. Nada no
// sistema sabe se o fio de uma OP chegou.
//
// E tem mais: `aguardando_materia_prima` é o status PADRÃO
// (`ordens_producao.status` tem `.default(...)`, e o ordem-form também).
// TODA OP NASCE LÁ. Então o status não quer dizer "o fio não chegou" — quer
// dizer "ninguém ainda tocou nesta OP no kanban", e uma OP recém-criada é
// indistinguível de uma travada de verdade.
//
// Por isso ela NÃO é bloqueada, e sim CONFIRMADA:
//
//   - Bloquear pararia a fábrica por um problema de cadastro. Sendo o status
//     padrão, "o gerente não arrastou o card" viraria "ninguém produz hoje".
//   - Quem sabe é quem está lá. O status não tem dado atrás dele; a pessoa
//     de pé na frente da máquina é a única que consegue olhar e ver se o fio
//     está na gaveta. O gerente, do escritório, não.
//   - E a confirmação vira LINHA NO HISTÓRICO (`eventos_kanban`, com
//     `usuario_id`). Daqui a um mês dá pra responder "quem disse que o fio
//     estava lá?". Sem ela, a resposta não existe em lugar nenhum.
//
// A exigência vale só pro OPERADOR. O gerente que pega uma OP pelo kanban
// está olhando pro board com a coluna "Aguardando MP" escrita na cara dele —
// é ato administrativo explícito, e pôr um diálogo ali seria mexer na tela
// de quem planeja pra resolver um problema de quem produz.

import type { StatusDaOrdem } from './destino-da-ordem'

// Os únicos status que aceitam entrar numa máquina, cada um com o motivo de
// estar aqui. Mapa, e não lista, pelo mesmo motivo do `MOTIVO_DE_IMPEDIMENTO`
// em estado-maquina.ts: status e explicação não podem divergir.
const PODEM_INICIAR = {
  // Julgamento humano, sem dado atrás. Ver o bloco acima.
  aguardando_materia_prima: 'confirma',
  // O caso normal: o gerente já programou, é só começar.
  programado: 'direto',
  // JÁ EM PRODUÇÃO E SEM MÁQUINA. Parece impossível e não é: o gerente pode
  // arrastar o card pra coluna "Em produção" no kanban sem escolher máquina.
  // A OP fica em produção em lugar nenhum. Deixá-la de fora daqui seria
  // deixá-la presa pra sempre — nenhuma tela do operador a resgataria.
  em_producao: 'direto',
} as const satisfies Partial<Record<StatusDaOrdem, 'direto' | 'confirma'>>

export type StatusQueInicia = keyof typeof PODEM_INICIAR

export function podeIniciar(status: StatusDaOrdem): status is StatusQueInicia {
  return status in PODEM_INICIAR
}

/** Os status que a consulta oferece — a mesma lista que a action aceita. */
export const STATUS_QUE_INICIAM = Object.keys(
  PODEM_INICIAR,
) as StatusQueInicia[]

/**
 * A pergunta que o operador precisa responder ANTES de a OP entrar na
 * máquina, ou null quando é só tocar. Devolver a frase (e não um booleano)
 * mantém a pergunta colada ao motivo dela.
 */
export function confirmacaoAntesDeIniciar(status: StatusDaOrdem): string | null {
  if (!podeIniciar(status)) return null
  return PODEM_INICIAR[status] === 'confirma'
    ? 'Esta OP está aguardando matéria-prima. O fio já está na máquina?'
    : null
}

/**
 * O que fica escrito no `eventos_kanban` quando o operador confirmou. É a
 * resposta ao "quem decidiu começar sem o fio confirmado?" — sem isto a
 * confirmação seria um clique que não deixa rastro nenhum.
 */
export const OBSERVACAO_DE_MATERIA_PRIMA =
  'Matéria-prima confirmada pelo operador ao iniciar'

/** O evento de quando a OP já estava em produção e só ganhou máquina. */
export function observacaoDeMaquinaAtribuida(codigo: string): string {
  return `Entrou na máquina ${codigo} (já estava em produção)`
}
