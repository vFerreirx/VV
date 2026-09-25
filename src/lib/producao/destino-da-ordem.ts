// ONDE CADA OP APARECE NA TELA DA ESTAÇÃO — regra pura, sem banco.
//
// A tela do operador tem três lugares onde uma OP pode estar, e a pergunta
// que este arquivo responde é "qual deles?". Irmão de `estado-maquina.ts`:
// aquele decide o que o CARTÃO mostra, este decide QUAIS OPs existem na tela.
//
// ─────────────────────────────────────────────────────────────────────────
// A PARTIÇÃO É EXAUSTIVA, E É O COMPILADOR QUE COBRA
// ─────────────────────────────────────────────────────────────────────────
//
// Toda OP que o operador enxerga cai em exatamente um destino. Isso não é
// arrumação: se um status não cair em lugar nenhum, a OP some da tela sem
// erro, sem aviso e sem log — o operador simplesmente nunca mais a vê.
//
// A tentação era definir a fila como `responsavelId === null`, que é o que a
// tela antiga fazia. Mas uma OP COM responsável e SEM máquina (o gerente
// cria essa combinação em /ordens) não estaria em lugar nenhum: não tem
// cartão porque não tem máquina, não é terminada, e não é "livre". A tela
// antiga a pegava na lista "Minhas OPs", que deixou de existir.
//
// ⚠️ O `switch` sem `default` mais o `const nunca: never` embaixo são o
// ponto do arquivo. Acrescentar um valor ao enum de status QUEBRA O BUILD
// aqui até alguém decidir onde ele aparece na estação. Antes disto a
// exaustividade dependia de um filtro que mora longe — `listarOrdensProducao`
// cortava 'enviado' e 'cancelado' na consulta —, e bastava alguém afrouxar
// aquele WHERE pra OP finalizada brotar na fila do operador sem ninguém ter
// mudado uma linha desta tela.
//
// ─────────────────────────────────────────────────────────────────────────
// OS QUATRO DESTINOS
// ─────────────────────────────────────────────────────────────────────────
//
//   maquina     — está no cartão da máquina. É a ÚNICA que ocupa a área
//                 principal, e é por isso que a tela não cresce com a fila.
//   fila        — esperando pra começar. Atrás do botão "Fila (N)".
//   terminadas  — a produção foi concluída nas últimas 24 h
//                 (`JANELA_DAS_TERMINADAS_MS`), qualquer que seja o status
//                 agora: esperando o despacho do Full ou já finalizada. Atrás
//                 do botão "Terminadas (N)". É pra onde vai a OP
//                 recém-concluída: sem este destino ela sumiria no toque de
//                 "Terminei" e ele não saberia se deu certo.
//   fora        — não é assunto de quem produz. Existe pra ser um destino
//                 EXPLÍCITO, e não uma omissão: cancelada, e a concluída há
//                 mais de 24 h (o Full que espera despacho há dias é assunto
//                 do gerente, não do operador), sumirem é decisão escrita.
//
// ─────────────────────────────────────────────────────────────────────────
// A JANELA DE 24 H — contada da CONCLUSÃO, não do despacho
// ─────────────────────────────────────────────────────────────────────────
//
// Uma constante só, usada pelo QUADRO (a coluna "Produção concluída" mostra
// as finalizadas desta janela) e pelo TABLET (as Terminadas). Passadas as 24
// h, a OP sai sozinha na próxima carga — não há timer. As duas consultas
// recebem o instante de corte por parâmetro (`inicioDaJanela`), então o
// número não está escrito em SQL.

import type { statusValues } from '@/lib/validators/ordens'

export type StatusDaOrdem = (typeof statusValues)[number]

export type DestinoNaEstacao = 'maquina' | 'fila' | 'terminadas' | 'fora'

export const JANELA_DAS_TERMINADAS_MS = 24 * 60 * 60 * 1000

/** O instante a partir do qual uma conclusão ainda está à vista. */
export function inicioDaJanela(agora: Date): Date {
  return new Date(agora.getTime() - JANELA_DAS_TERMINADAS_MS)
}

/** A conclusão ainda está dentro das 24 h? Null = não há conclusão. */
export function concluidaNaJanela(concluidaEm: Date | null, agora: Date): boolean {
  return (
    concluidaEm !== null &&
    concluidaEm.getTime() >= inicioDaJanela(agora).getTime()
  )
}

export function destinoDaOrdem(
  status: StatusDaOrdem,
  estaNumaMaquinaDaEstacao: boolean,
  /** `concluidaNaJanela` da conclusão mais recente. */
  naJanela: boolean,
): DestinoNaEstacao {
  // A MÁQUINA VENCE O STATUS, e nesta ordem. Quem responde "está no cartão?"
  // é a máquina ter a OP em produção — o mesmo recorte do índice único
  // `ordens_producao_maquina_em_producao_uidx` (migration 50). Perguntar ao
  // status abriria a chance de a mesma OP contar duas vezes.
  if (estaNumaMaquinaDaEstacao) return 'maquina'

  switch (status) {
    case 'aguardando_materia_prima':
    case 'programado':
      return 'fila'

    // EM PRODUÇÃO E FORA DE MÁQUINA existe: o gerente pode mover a OP no
    // kanban sem escolher máquina. Ela cai na fila em vez de sumir — é
    // exatamente o buraco que este arquivo fecha.
    case 'em_producao':
      return 'fila'

    // Concluída — esperando o despacho do Full ou já finalizada. À vista
    // só dentro da janela.
    case 'pronto_envio':
    case 'enviado':
      return naJanela ? 'terminadas' : 'fora'

    // LEGADO do fluxo antigo, sem conclusão registrada — nenhuma OP viva
    // está nesses status. O operador não age nelas (só o gerente conclui de
    // lá, pelo board).
    case 'acabamento':
    case 'embalagem':
    case 'cancelado':
      return 'fora'

    default: {
      const nunca: never = status
      throw new Error(`Status sem destino na estação: ${String(nunca)}`)
    }
  }
}
