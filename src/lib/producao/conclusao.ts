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
// ⚠️ E O TETO É SÓ DO OPERADOR. `apontarProducaoAction`, que é a ferramenta
// do gerente no op-detail-sheet, continua sem limite. Se a fábrica de fato
// fizer 32 numa OP de 30, as peças existem no mundo e alguém tem que
// conseguir registrar — a decisão é que essa pessoa é quem planejou, não
// quem está na máquina.
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
): string | null {
  if (!Number.isInteger(produzida) || produzida < 0) {
    return 'Quantidade inválida'
  }
  if (!Number.isInteger(refugo) || refugo < 0) {
    return 'Refugo inválido'
  }
  if (produzida > restante) {
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
 */
export function resumoDaConclusao(
  produzida: number,
  refugo: number,
  { meta, jaRegistrado }: Conclusao,
): string {
  const total = jaRegistrado + produzida
  const falta = meta - total
  const partes = [`Concluída com ${total} de ${meta} peças`]
  if (falta > 0) partes.push(`(${falta} a menos)`)
  if (refugo > 0) partes.push(`· ${refugo} refugo`)
  return partes.join(' ')
}
