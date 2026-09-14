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
  { semMaquina = false }: { semMaquina?: boolean } = {},
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
  return partes.join(' ')
}
