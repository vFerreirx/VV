// Que tamanho cada COMPONENTE de um kit recebe, e quando existe um tamanho
// que representa o kit inteiro.
//
// Módulo PURO e compartilhado de propósito: a mesma regra decide os
// seletores de tamanho do builder do pedido, o preço de tabela do kit e a
// soma do preço dos componentes. Se cada tela tivesse a sua, o preço
// cadastrado num tamanho deixaria de ser alcançável pelo pedido sem ninguém
// perceber.
//
// O tamanho é POR COMPONENTE, não do kit. Antes havia um seletor só, e o
// tamanho escolhido era empurrado pra todos: funcionava enquanto só um
// componente tinha tamanho variável (a peseira em Casal/King/Queen, com a
// capa sempre 45x45). No "Kit Peseira+ 2 Capas de Almofada - ACONCHEGO" a
// capa também varia (45x45/50x50/60x60) — escolher "Queen" deixava a capa
// SEM tamanho nenhum, e sem tamanho não há peso nem preço, o que invalidava
// o kit inteiro. Cada componente variável escolhe o seu.

/** Tamanhos que um produto oferece (das variações dele). */
export type TamanhosDe = (produtoId: string) => string[]

/** Tamanho escolhido para cada componente, indexado por produtoId. */
export type EscolhasDeTamanho = Record<string, string>

function distintos(lista: string[]): string[] {
  return [...new Set(lista.filter(Boolean))]
}

/**
 * Componentes que TÊM escolha de tamanho (2+ opções) — os que precisam de
 * seletor. Componente de tamanho único se resolve sozinho e não vira campo
 * na tela: capa 45x45, manta Manta, baguete Baguete.
 */
export function componentesVariaveis<T extends { produtoId: string }>(
  componentes: T[],
  tamanhosDe: TamanhosDe,
): T[] {
  return componentes.filter((c) => tamanhosDe(c.produtoId).length > 1)
}

/**
 * Tamanho DESTE componente. Um tamanho só = é ele, sem perguntar. Vários =
 * vale o que foi escolhido pra ele, e null enquanto não escolherem.
 *
 * A escolha é validada contra os tamanhos do próprio componente: escolha de
 * outro componente não vaza pra cá, que era exatamente o defeito antigo.
 */
export function tamanhoDoComponente(
  produtoId: string,
  escolhas: EscolhasDeTamanho | null | undefined,
  tamanhosDe: TamanhosDe,
): string | null {
  const ts = tamanhosDe(produtoId)
  if (ts.length === 0) return null
  if (ts.length === 1) return ts[0]!
  const escolhido = escolhas?.[produtoId]
  return escolhido && ts.includes(escolhido) ? escolhido : null
}

/**
 * Tamanhos que o KIT INTEIRO pode assumir — o que dá sentido a um preço
 * fechado em `kit_tamanho_preco`, que é chaveado por um tamanho só.
 *
 * Só existe quando EXATAMENTE UM componente varia de tamanho: aí "o tamanho
 * do kit" é o tamanho dele e não há ambiguidade. Com zero (kits de manta)
 * não há tamanho a escolher; com dois ou mais não existe um tamanho que
 * descreva o kit — "Queen" não diz nada sobre a capa. Nos dois casos a
 * lista é vazia e o preço vem da soma dos componentes.
 */
export function tamanhosDoKit(
  componentes: { produtoId: string }[],
  tamanhosDe: TamanhosDe,
): string[] {
  const variaveis = componentesVariaveis(componentes, tamanhosDe)
  if (variaveis.length !== 1) return []
  return distintos(tamanhosDe(variaveis[0]!.produtoId))
}

/**
 * O tamanho que representa o kit inteiro nas escolhas atuais, ou null quando
 * não existe um. É o que vai pra `orcamento_itens.tamanho`.
 *
 * Null NÃO é perda de informação: o tamanho real de cada peça vive no
 * snapshot `kit_componentes[].tamanho`, que agora sai sempre preenchido.
 */
export function tamanhoDoKit(
  componentes: { produtoId: string }[],
  escolhas: EscolhasDeTamanho | null | undefined,
  tamanhosDe: TamanhosDe,
): string | null {
  const variaveis = componentesVariaveis(componentes, tamanhosDe)
  if (variaveis.length !== 1) return null
  return tamanhoDoComponente(variaveis[0]!.produtoId, escolhas, tamanhosDe)
}

/**
 * Todas as combinações de tamanho possíveis do kit — uma escolha por
 * componente variável. Usado pra faixa de preço na tela de kits.
 *
 * O teto existe só por segurança: com o catálogo real são no máximo 9
 * (3 tamanhos de peseira × 3 de capa). Se um dia um kit tiver muitos
 * componentes variáveis, é melhor a faixa ficar incompleta do que a tela
 * travar montando milhares de combinações.
 */
export function combinacoesDeTamanho(
  componentes: { produtoId: string }[],
  tamanhosDe: TamanhosDe,
  teto = 64,
): EscolhasDeTamanho[] {
  const variaveis = componentesVariaveis(componentes, tamanhosDe)
  let combos: EscolhasDeTamanho[] = [{}]
  for (const c of variaveis) {
    const proximas: EscolhasDeTamanho[] = []
    for (const combo of combos) {
      for (const t of tamanhosDe(c.produtoId)) {
        if (proximas.length >= teto) return proximas
        proximas.push({ ...combo, [c.produtoId]: t })
      }
    }
    combos = proximas
  }
  return combos
}
