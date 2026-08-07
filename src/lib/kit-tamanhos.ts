// Que tamanho um KIT assume, e que tamanho cada componente dele recebe.
//
// Módulo PURO e compartilhado de propósito: a mesma regra decide o seletor
// de tamanho do builder do pedido, o preço de tabela do kit e a soma do
// preço dos componentes. Se cada tela tivesse a sua, o preço cadastrado num
// tamanho deixaria de ser alcançável pelo pedido sem ninguém perceber.
//
// A regra saiu do catálogo real: capa é sempre 45x45, manta sempre Manta e
// baguete sempre Baguete; o único componente com tamanho de verdade variável
// é a peseira (Casal/King/Queen). Oferecer a união crua faria escolher
// "45x45" como "tamanho do kit", que não quer dizer nada.

/** Tamanhos que um produto oferece (das variações dele). */
export type TamanhosDe = (produtoId: string) => string[]

function distintos(lista: string[]): string[] {
  return [...new Set(lista.filter(Boolean))]
}

/**
 * Tamanhos oferecidos pro kit inteiro (um seletor só). Só entram os
 * tamanhos dos componentes que TÊM escolha de tamanho (2+ opções).
 *
 * Lista vazia é resposta legítima: kit em que nenhum componente varia de
 * tamanho não tem "tamanho do kit" — é o caso dos kits de manta.
 */
export function tamanhosDoKit(
  componentes: { produtoId: string }[],
  tamanhosDe: TamanhosDe,
): string[] {
  return distintos(
    componentes.flatMap((c) => {
      const ts = tamanhosDe(c.produtoId)
      return ts.length > 1 ? ts : []
    }),
  )
}

/**
 * Resolve o tamanho DESTE componente a partir da escolha única do kit: usa o
 * tamanho do kit quando o componente tem esse tamanho; senão, se o
 * componente só tem um tamanho possível, é ele (capa 45x45, manta Manta).
 *
 * Devolve null quando não dá pra decidir — acontece quando dois componentes
 * têm tamanho variável e o escolhido pertence só a um deles. Nesse caso o
 * peso e o preço do kit ficam sem resposta, o que é melhor que chutar.
 */
export function tamanhoDoComponente(
  produtoId: string,
  tamanhoKit: string | null | undefined,
  tamanhosDe: TamanhosDe,
): string | null {
  const ts = tamanhosDe(produtoId)
  if (tamanhoKit && ts.includes(tamanhoKit)) return tamanhoKit
  if (ts.length === 1) return ts[0]!
  return null
}
