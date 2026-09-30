// QUAL ESTAÇÃO O TABLET MOSTRA — regra pura, sem banco e sem React.
//
// A estação é do APARELHO (o gerente define uma vez em cada tablet, em "Este
// aparelho"), nunca do operador — o porquê está em cobertura.ts. Ela só
// ORGANIZA a tela, nunca trava: o tablet abre nas máquinas da estação do aparelho, e
// as outras ficam a um toque, nas abas.
//
// Três telas possíveis:
//   estacao      — as máquinas de UMA estação. É o normal.
//   sem-estacao  — as máquinas que não estão em estação nenhuma. A aba só
//                  existe se houver alguma.
//   todas        — o tablet SEM estação definida: todas as máquinas, em
//                  seções por estação, com a faixa "chame o gerente". Sem abas.
//
// A tela que está aberta vem da URL (`?estacao=`), e não de estado do
// cliente: o servidor monta a grade, e o `router.refresh()` do Realtime tem
// que remontar a MESMA aba. Voltar pra estação do aparelho é tirar o
// parâmetro — é o que a trava por inatividade faz.
//
// ⚠️ A TELA NÃO É PERMISSÃO. Qualquer operador age em qualquer máquina; o
// servidor recebe a tela da URL e só FILTRA com ela. Um valor inventado ali
// mostra outra estação, que ele já podia abrir tocando na aba.

export type TelaDoTablet =
  | { tipo: 'estacao'; id: string }
  | { tipo: 'sem-estacao' }
  | { tipo: 'todas' }

/** O valor de `?estacao=` da aba das máquinas sem estação. */
export const PARAM_SEM_ESTACAO = 'sem'

/**
 * A tela a abrir. `aparelhoId` já vem conferido contra as estações vivas —
 * null é o tablet sem estação, e aí o parâmetro não vale: sem estação do
 * aparelho não há abas pra ele escolher.
 */
export function telaDoTablet(
  parametro: string | undefined,
  aparelhoId: string | null,
  estacoesVivas: ReadonlySet<string>,
): TelaDoTablet {
  if (aparelhoId === null) return { tipo: 'todas' }
  if (parametro === PARAM_SEM_ESTACAO) return { tipo: 'sem-estacao' }
  if (parametro !== undefined && estacoesVivas.has(parametro)) {
    return { tipo: 'estacao', id: parametro }
  }
  // Estação apagada ou parâmetro lixo: volta pra casa, em vez de uma grade
  // vazia que parece bug.
  return { tipo: 'estacao', id: aparelhoId }
}

/** A máquina desta estação (null = sem estação) aparece nesta tela? */
export function maquinaNaTela(
  estacaoDaMaquina: string | null,
  tela: TelaDoTablet,
): boolean {
  switch (tela.tipo) {
    case 'todas':
      return true
    case 'sem-estacao':
      return estacaoDaMaquina === null
    case 'estacao':
      return estacaoDaMaquina === tela.id
  }
}

/**
 * A OP terminada conta nas Terminadas desta tela? Segue a MÁQUINA em que ela
 * foi feita. Sem máquina (a OP concluída direto da fila pelo gerente) ela não
 * é de estação nenhuma, e aparece em todas — como a fila, que é comum.
 *
 * `maquina` null = a OP não tem máquina; `{ estacaoId: null }` = tem máquina,
 * e a máquina é que está sem estação.
 */
export function terminadaNaTela(
  maquina: { estacaoId: string | null } | null,
  tela: TelaDoTablet,
): boolean {
  return maquina === null || maquinaNaTela(maquina.estacaoId, tela)
}

export type AbaDoTablet = {
  /** O valor de `?estacao=`: o id da estação, ou `PARAM_SEM_ESTACAO`. */
  chave: string
  nome: string
  /** É a estação deste aparelho. */
  doAparelho: boolean
}

/**
 * As abas, com a do APARELHO primeiro — é a casa do tablet, e a posição fixa
 * é o que deixa achar de longe. As outras seguem pelo nome, com o número
 * comparado como número ("Estação 10" depois da "Estação 9"). "Sem estação"
 * por último, e só se houver máquina sem.
 */
export function abasDoTablet(
  estacoes: readonly { id: string; nome: string }[],
  aparelhoId: string,
  haMaquinaSemEstacao: boolean,
): AbaDoTablet[] {
  const porNome = [...estacoes].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }),
  )
  const abas: AbaDoTablet[] = [
    ...porNome.filter((e) => e.id === aparelhoId),
    ...porNome.filter((e) => e.id !== aparelhoId),
  ].map((e) => ({ chave: e.id, nome: e.nome, doAparelho: e.id === aparelhoId }))
  if (haMaquinaSemEstacao) {
    abas.push({ chave: PARAM_SEM_ESTACAO, nome: 'Sem estação', doAparelho: false })
  }
  return abas
}

/** A aba que corresponde a esta tela (null na tela 'todas', que não tem abas). */
export function chaveDaTela(tela: TelaDoTablet): string | null {
  switch (tela.tipo) {
    case 'todas':
      return null
    case 'sem-estacao':
      return PARAM_SEM_ESTACAO
    case 'estacao':
      return tela.id
  }
}

/**
 * O caminho de volta de `chaveDaTela`. Existe pra o cliente carregar a tela
 * numa dependência de efeito como TEXTO: o objeto da tela é novo a cada
 * `router.refresh()`, e como dependência refaria a busca a cada recarga.
 */
export function telaDaChave(chave: string | null): TelaDoTablet {
  if (chave === null) return { tipo: 'todas' }
  if (chave === PARAM_SEM_ESTACAO) return { tipo: 'sem-estacao' }
  return { tipo: 'estacao', id: chave }
}
