// O QUE UM EVENTO DO REALTIME MUDA NO TABLET DE UMA ESTAÇÃO — regra pura.
//
// O tablet recarregava a cada mudança em `ordens_producao` e `maquinas` da
// fábrica INTEIRA. Com 4 tablets em 2 estações, uma OP concluída na Estação 1
// fazia os tablets da Estação 2 recarregarem a tela toda por nada — e cada
// recarga segura conexão do banco (em 17/09/2026 o sistema travou por
// conexão presa; o banco aceita 15).
//
// A resposta tem TRÊS níveis:
//   'tela'       → o evento mexe num cartão desta estação: recarrega a tela.
//   'contadores' → só pode mudar os números de Fila e Terminadas: recalcula
//                  os dois, sem recarregar a tela.
//   null         → não é desta estação: ignora.
//
// ⚠️ O REALTIME NÃO TRAZ A LINHA ANTIGA NUM UPDATE (sem REPLICA IDENTITY FULL,
// `old` só tem a chave). Então "a OP SAIU de uma máquina desta estação" não
// dá pra ler do evento. Dá pra ler do que a TELA já sabe: se a OP saiu de um
// cartão, ela ESTAVA num cartão — e os ids das OPs nos cartões estão na tela.
// Mesmo raciocínio pros contadores: a tela guarda os ids que entraram na
// conta, e uma OP que sai da fila pra máquina de OUTRA estação ainda está
// nessa lista.
//
// ⚠️ OS NOMES DAS COLUNAS SÃO OS DO BANCO (snake_case): o payload do Realtime
// não passa pelo Drizzle.

export type ContextoDaEstacao = {
  estacaoId: string | null
  /** Máquinas desta estação. */
  maquinaIds: ReadonlySet<string>
  /** OPs que estão agora nos cartões (em produção nas máquinas daqui). */
  opIdsNosCartoes: ReadonlySet<string>
  /** OPs que entraram na conta de Fila e Terminadas. */
  opIdsContados: ReadonlySet<string>
}

type Linha = Record<string, unknown> | null | undefined

export type EventoDoRealtime = {
  tabela: string
  novo: Linha
  antigo: Linha
}

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null

export function reacaoDaEstacao(
  evento: EventoDoRealtime,
  ctx: ContextoDaEstacao,
): 'tela' | 'contadores' | null {
  const novo = evento.novo && Object.keys(evento.novo).length > 0 ? evento.novo : null
  const id = texto(novo?.id) ?? texto(evento.antigo?.id)

  if (evento.tabela === 'maquinas') {
    if (id !== null && ctx.maquinaIds.has(id)) return 'tela'
    // Máquina que ENTROU nesta estação (a que saiu já estava na lista).
    if (ctx.estacaoId !== null && texto(novo?.estacao_id) === ctx.estacaoId) {
      return 'tela'
    }
    return null
  }

  if (evento.tabela === 'ordens_producao') {
    if (id !== null && ctx.opIdsNosCartoes.has(id)) return 'tela'
    const maquinaNova = texto(novo?.maquina_id)
    if (maquinaNova !== null && ctx.maquinaIds.has(maquinaNova)) return 'tela'
    if (id !== null && ctx.opIdsContados.has(id)) return 'contadores'
    // OP SEM MÁQUINA é da fila de TODAS as estações (`condicaoDeVisaoDoOperador`):
    // uma OP nova, ou mexida na fila, muda o contador daqui também.
    if (novo !== null && maquinaNova === null) return 'contadores'
    return null
  }

  return null
}
