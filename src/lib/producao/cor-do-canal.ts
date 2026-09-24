// A COR DO MARKETPLACE — em um lugar só.
//
// No Trello, cada Full era um painel, e a cor do marketplace era a coisa mais
// visível da parede. Aqui ela marca o BLOCO de destino no "Iniciar" do tablet,
// a borda de cada OP daquele Full, o cartão da máquina com OP de Full, a
// pasta de Full do kanban e a etiqueta do envio no calendário. Mercado Livre
// AMARELO, Shopee LARANJA, o resto sem cor. Tablet, kanban e calendário leem
// DAQUI: se cada tela escolhesse o seu tom, o amarelo do gerente e o do
// operador seriam dois amarelos — e foram, até o calendário (que tinha o ML
// em âmbar) passar a ler daqui também.
//
// ⚠️ NUNCA NO FUNDO DA LINHA DA OP, NEM PERTO DO QUADRADINHO. O quadradinho é
// a COR DO FIO, que o operador confere contra a máquina — duas manchas de cor
// lado a lado disputam o mesmo olhar, e a do fio perde. Por isso a OP ganha
// só uma BORDA à esquerda, do lado oposto ao conteúdo, e o texto "Full ML ·
// Conta 1" continua escrito: cor ajuda, mas não substitui a palavra (quem não
// distingue amarelo de laranja lê o nome).
//
// ⚠️ LUZ DE GALPÃO. O cabeçalho é TEXTO ESCURO sobre a versão CLARA da cor,
// com a barra grossa na cor CHEIA — nunca texto branco sobre amarelo, que
// some. No modo escuro, a cor vira um véu translúcido com texto claro.
//
// As classes são LITERAIS de propósito: o Tailwind só gera a classe que ele
// encontra escrita inteira no código. Montar "bg-" + cor em tempo de execução
// deixaria o CSS sem a classe, e a cor sumiria sem erro.
//
// Lógica pura (as classes são só texto): testada em regras.test.ts.

export type CorDoCanal = {
  /** "Mercado Livre" / "Shopee" — pro aria-label e pro teste. */
  nome: string
  /** Faixa do cabeçalho: fundo claro + texto escuro (e o par do modo escuro). */
  faixa: string
  /** A barra grossa, na cor cheia. Vai num elemento próprio (`w-2 self-stretch`). */
  barra: string
  /**
   * A borda à esquerda, como SOMBRA INTERNA e não como `border-l`: sombra não
   * ocupa espaço, então o conteúdo não anda um pixel — e no cartão da máquina
   * os botões ficam exatamente onde o operador aprendeu que estão.
   */
  borda: string
}

const AMARELO: CorDoCanal = {
  nome: 'Mercado Livre',
  faixa:
    'bg-yellow-100 text-yellow-950 dark:bg-yellow-400/15 dark:text-yellow-50',
  barra: 'bg-yellow-400',
  borda: 'shadow-[inset_6px_0_0_var(--color-yellow-400)]',
}

const LARANJA: CorDoCanal = {
  nome: 'Shopee',
  faixa:
    'bg-orange-100 text-orange-950 dark:bg-orange-500/15 dark:text-orange-50',
  barra: 'bg-orange-500',
  borda: 'shadow-[inset_6px_0_0_var(--color-orange-500)]',
}

const POR_CANAL: Record<string, CorDoCanal> = {
  full_ml: AMARELO,
  full_shopee: LARANJA,
}

/** A cor do canal, ou null (venda direta, estoque, pedido): sem cor. */
export function corDoCanal(canal: string | null | undefined): CorDoCanal | null {
  return (canal && POR_CANAL[canal]) || null
}
