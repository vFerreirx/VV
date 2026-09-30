// "VOCÊ ESTÁ COBRINDO?" — regra pura, sem banco e sem React.
//
// ─────────────────────────────────────────────────────────────────────────
// A ESTAÇÃO É DO TABLET, NÃO DO OPERADOR
// ─────────────────────────────────────────────────────────────────────────
//
// A fábrica tem quatro tablets fixos, cada um perto de um grupo de máquinas —
// esse grupo é a estação. O operador não pertence a estação nenhuma: no
// almoço ele cobre a máquina do colega do outro lado do galpão, e de
// madrugada, sem gerente, reveza por horário. Prender operador a estação
// fazia o Bruno, cobrindo a TC-10, não aparecer no "Quem é você?" do tablet
// dela — e o registro saía no nome de quem estava logado, que é o problema de
// autoria que o PIN existe pra resolver.
//
// Então qualquer operador age em qualquer máquina, de qualquer tablet, e o
// servidor NÃO recusa. Este aviso é CONFIRMAÇÃO DE TELA, não permissão: ele
// existe pra pegar o toque no cartão errado quando o operador abriu a aba de
// outra estação. A cobertura normal acontece no tablet da própria máquina, e
// ali não há aviso nenhum.
//
// A regra:
//   - só quando o APARELHO tem estação. Tablet sem estação definida já mostra
//     a faixa "chame o gerente", e avisar a cada toque nele seria ruído;
//   - estação da máquina ≠ estação do aparelho. Máquina SEM estação conta
//     como diferente, com texto próprio: ela não é "de" ninguém, e quem pode
//     resolver isso é o gerente.
//
// A frase volta pronta daqui pra que as seis ações do tablet (Iniciar,
// Terminei, Parada, Voltou, Peguei errado, Desfazer) digam a mesma coisa.

export type EstacaoRef = { id: string; nome: string }

export type MaquinaParaCobertura = {
  codigo: string
  /** A estação da máquina, ou null se ela não está em nenhuma. */
  estacao: EstacaoRef | null
}

/**
 * A pergunta a fazer antes de gravar nesta máquina a partir deste tablet, ou
 * null quando não há o que perguntar.
 */
export function avisoDeCobertura(
  maquina: MaquinaParaCobertura,
  estacaoDoAparelho: EstacaoRef | null,
): string | null {
  if (estacaoDoAparelho === null) return null
  if (maquina.estacao === null) {
    return `A ${maquina.codigo} está sem estação. Gravar mesmo assim? Avise o gerente pra colocar ela numa estação.`
  }
  if (maquina.estacao.id === estacaoDoAparelho.id) return null
  return `A ${maquina.codigo} é da ${maquina.estacao.nome}. Você está cobrindo?`
}
