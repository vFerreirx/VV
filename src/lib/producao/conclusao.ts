// CONCLUIR A PRODUÇÃO — regra pura, sem banco.
//
// Quarto irmão de `estado-maquina.ts`, `destino-da-ordem.ts` e
// `inicio-da-op.ts`. Este responde as duas perguntas do fim da OP: quanto
// sugerir, e até quanto deixar registrar.
//
// ─────────────────────────────────────────────────────────────────────────
// O TETO É A META DO GERENTE. NÃO DÁ PRA PASSAR.
// ─────────────────────────────────────────────────────────────────────────
//
// O operador não registra mais peças boas do que a quantidade que o gerente
// pediu na OP. Uma OP de 30 aceita 30, aceita 27, e não aceita 31.
//
// ⚠️ O TETO É SÓ SOBRE PEÇAS BOAS. Refugo NÃO entra na conta: refugo é peça
// perdida, não produção. Se o fio veio ruim e queimaram 5 além da meta, isso
// precisa caber no registro — tampar o refugo faria o operador arredondar
// pra baixo pra conseguir salvar, e o número que sobra mente sobre o
// rendimento do lote.
//
// ⚠️ E O TETO É SÓ DO OPERADOR. O gerente conclui pelo board e aponta pelo
// sheet sem limite: se a fábrica de fato fizer 32 numa OP de 30, as peças
// existem no mundo e alguém tem que conseguir registrar — a decisão é que
// essa pessoa é quem planejou, não quem está na máquina. É por isso que o
// teto é uma OPÇÃO de `erroDeQuantidade`, ligada por padrão: quem esquecer
// de passar cai no lado seguro, que é o do tablet.
//
// ─────────────────────────────────────────────────────────────────────────
// ABAIXO DA META CONCLUI, E A DIFERENÇA VAI PRO HISTÓRICO
// ─────────────────────────────────────────────────────────────────────────
//
// Recusar uma conclusão porque saíram 27 de 30 travaria a máquina com um
// trabalho que já acabou — a tela existe pra destravar a estação, não pra
// prendê-la. Então conclui, e a diferença vira texto no `eventos_kanban`,
// que é onde o gerente confere antes de mandar pra 'enviado'.
//
// ─────────────────────────────────────────────────────────────────────────
// O QUE JÁ FOI REGISTRADO NÃO CONTA DE NOVO
// ─────────────────────────────────────────────────────────────────────────
//
// No fluxo novo o registro é feito só no fim, então `jaRegistrado` é zero
// quase sempre. Mas OP legada tem apontamento, e o gerente pode apontar pelo
// sheet no meio do caminho. Nesses casos o sugerido (e o teto) é O QUE
// FALTA, e o apontamento novo grava só o incremento. Somar a meta cheia por
// cima do que já existe dobraria a produção do dia em silêncio.

import { diaEmBrasilia, diasEntre } from '../dia-brasil.ts'

export type Conclusao = {
  /** A quantidade da OP — o que o gerente pediu. */
  meta: number
  /** Soma dos apontamentos que já existem nesta OP. Zero no fluxo novo. */
  jaRegistrado: number
  /**
   * Quanto falta pra meta: o valor SUGERIDO no campo e, ao mesmo tempo, o
   * TETO do que dá pra registrar agora. Nunca negativo — OP que já passou
   * da meta por apontamento antigo sugere zero, e concluir com zero
   * adicional é válido.
   */
  restante: number
}

export function calcularConclusao(
  meta: number,
  jaRegistrado: number,
): Conclusao {
  return {
    meta,
    jaRegistrado,
    restante: Math.max(0, meta - jaRegistrado),
  }
}

/**
 * Por que este número não pode ser gravado, ou null se pode. Devolve a frase
 * pronta porque o servidor recusa com ela e a tela explica com ela — não dá
 * pra uma versão divergir da outra.
 */
export function erroDeQuantidade(
  produzida: number,
  refugo: number,
  { meta, jaRegistrado, restante }: Conclusao,
  { teto = true }: { teto?: boolean } = {},
): string | null {
  if (!Number.isInteger(produzida) || produzida < 0) {
    return 'Quantidade inválida'
  }
  if (!Number.isInteger(refugo) || refugo < 0) {
    return 'Refugo inválido'
  }
  if (teto && produzida > restante) {
    // A mensagem muda conforme haja registro anterior: "o máximo é 30" numa
    // OP que já tem 12 registradas seria uma meia-verdade que ele não tem
    // como conferir na tela.
    return jaRegistrado > 0
      ? `A OP é de ${meta} peças e ${jaRegistrado} já foram registradas — o máximo agora é ${restante}`
      : `A OP é de ${meta} peças. Não dá pra registrar mais que isso.`
  }
  return null
}

/**
 * O texto que fica no `eventos_kanban`. É onde o gerente lê o que aconteceu
 * antes de mandar a OP pra 'enviado' — por isso diz o total contra a meta, e
 * não só o que entrou agora.
 *
 * ⚠️ QUEM REGISTROU NÃO É QUEM PRODUZIU, e desde que o registro passou a ser
 * feito só no fim isso ficou invisível. Existe UM apontamento, no nome de
 * quem concluiu: se o teste1 roda a OP seis horas e o teste2 conclui, as 30
 * peças saem todas no teste2.
 *
 * NÃO DÁ PRA RATEAR, e inventar um rateio seria pior que não ter — o sistema
 * não sabe quantas peças saíram em cada turno, e essa é a consequência
 * aceita de "registrar só no fim". O que dá é NOMEAR A PASSAGEM: o
 * `eventos_kanban` sabe quem iniciou, e dizer isso na mesma linha devolve a
 * pergunta respondível no lugar onde o gerente confere.
 *
 * `iniciadaPor` só entra quando é OUTRA pessoa. Numa OP que a mesma pessoa
 * começou e terminou, "iniciada por ela mesma" é ruído.
 *
 * ⚠️ "PRODUÇÃO CONCLUÍDA", NUNCA "CONCLUÍDA" SOZINHA. A OP tem dois fins: sair
 * da máquina (esta linha) e receber baixa (`enviado`). Com a palavra solta, o
 * gerente lendo o histórico não distingue um do outro.
 *
 * `semMaquina` marca a conclusão que o gerente faz direto da fila — a OP que
 * saiu do tear enquanto o board ainda não sabia dela (a virada do Trello). A
 * análise futura não precisa desta frase pra achá-las: a transição do evento
 * já diz (`status_anterior` diferente de `em_producao`). A frase é pra quem
 * lê o histórico e estranha a OP sem máquina.
 */
export function resumoDaConclusao(
  produzida: number,
  refugo: number,
  { meta, jaRegistrado }: Conclusao,
  iniciadaPor?: string | null,
  {
    semMaquina = false,
    diasDeAtraso = 0,
  }: { semMaquina?: boolean; diasDeAtraso?: number } = {},
): string {
  const total = jaRegistrado + produzida
  const diferenca = meta - total
  const partes = [`Produção concluída com ${total} de ${meta} peças`]
  if (diferenca > 0) partes.push(`(${diferenca} a menos)`)
  // Só o gerente passa da meta — o teto do operador não deixa. Sem isto, 32
  // de 30 saía igual a 30 de 30 no histórico.
  if (diferenca < 0) partes.push(`(${-diferenca} a mais)`)
  if (refugo > 0) partes.push(`· ${refugo} refugo`)
  if (iniciadaPor) partes.push(`· iniciada por ${iniciadaPor}`)
  if (semMaquina) partes.push('· sem passar por máquina')
  // O ATRASO FICA NO HISTÓRICO. Depois da conclusão a OP deixa de ser
  // "atrasada" nas telas (atraso-da-op.ts) — sem esta linha, o fato de ter
  // saído depois do prazo sumiria junto com o vermelho.
  if (diasDeAtraso > 0) {
    partes.push(
      `· concluída com ${diasDeAtraso} ${diasDeAtraso === 1 ? 'dia' : 'dias'} de atraso`,
    )
  }
  return partes.join(' ')
}

/**
 * Quantos dias DEPOIS do prazo a produção foi concluída. Zero quando foi no
 * prazo, no próprio dia do prazo, ou quando a OP não tem prazo.
 *
 * ⚠️ DIAS DE CALENDÁRIO EM BRASÍLIA, e não horas divididas por 24: o prazo é
 * "até o dia 27", e concluir às 22h do dia 27 é no prazo — mesmo sendo 01h
 * do dia 28 em UTC. Compara o dia do prazo com o dia da conclusão, os dois
 * lidos no fuso da fábrica.
 */
export function diasDeAtrasoNaConclusao(
  prazo: Date | null,
  concluidaEm: Date,
): number {
  if (prazo === null) return 0
  const dias = diasEntre(diaEmBrasilia(prazo), diaEmBrasilia(concluidaEm))
  return dias > 0 ? dias : 0
}

// ─────────────────────────────────────────────────────────────────────────
// DESFAZER: NO TABLET, SÓ QUEM CONCLUIU
// ─────────────────────────────────────────────────────────────────────────
//
// O desfazer existe pra "fiz agora e foi errado" — e só quem concluiu sabe
// que errou. Um colega de estação que desfaz a conclusão do outro não está
// corrigindo engano nenhum: está APAGANDO o apontamento de alguém, horas
// depois, sem ter visto a peça sair. Foi o que aconteceu em 15/09: a teste1
// desfez às 15:18 uma conclusão que o admin tinha feito às 11:02, e as 50
// peças sumiram do total.
//
// Gerente e admin continuam desfazendo qualquer uma (board e ficha da OP) —
// quem chama esta função é só o caminho do operador.

/** Quem fez a conclusão mais recente da OP. Null = não há evento dela. */
export type AutorDaConclusao = { id: string | null; nome: string | null } | null

/**
 * Por que ESTE operador não pode desfazer esta conclusão, ou null se pode.
 *
 * ⚠️ SEM AUTOR, RECUSA. OP legada sem evento de conclusão, ou evento cujo
 * usuário não existe mais: não dá pra provar que foi o próprio operador, e o
 * lado seguro de uma ação que apaga apontamento é o gerente decidir.
 */
export function erroDoAutorDoDesfazer(
  autor: AutorDaConclusao,
  operadorId: string,
): string | null {
  if (autor === null || autor.id === null) {
    return 'Não há registro de quem concluiu. Só o gerente pode desfazer.'
  }
  if (autor.id === operadorId) return null
  return `Quem concluiu foi ${autor.nome ?? 'outra pessoa'}. Só essa pessoa ou o gerente podem desfazer.`
}
