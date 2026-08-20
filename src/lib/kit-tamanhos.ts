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
 * Tamanhos que o KIT INTEIRO pode assumir — os valores possíveis de
 * `orcamento_itens.tamanho`.
 *
 * ⚠️ NÃO É MAIS A CHAVE DE PREÇO. Era, quando `kit_tamanho_preco` guardava um
 * `tamanho_id` só; hoje a chave é `chaveDeTamanhos` (logo abaixo), que cobre
 * todos os componentes variáveis. Usar esta função pra procurar preço deixa o
 * Kit ACONCHEGO sem preço nenhum, porque ela devolve `[]` quando dois
 * componentes variam.
 *
 * Só existe quando EXATAMENTE UM componente varia de tamanho: aí "o tamanho
 * do kit" é o tamanho dele e não há ambiguidade. Com zero (kits de manta)
 * não há tamanho a escolher; com dois ou mais não existe um tamanho que
 * descreva o kit — "Queen" não diz nada sobre a capa.
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
 * A CHAVE DE PREÇO DO KIT: a combinação dos tamanhos de TODOS os componentes
 * variáveis, num texto canônico.
 *
 * Por que a combinação e não "o tamanho do kit": porque o preço depende de
 * todos eles. O Kit ACONCHEGO custa 149,99 com capa 45, 159,99 com capa 50 e
 * 169,99 com capa 60 — no MESMO tamanho de peseira. Um tamanho só (que é o
 * que `tamanhoDoKit` devolve, e o que `kit_tamanho_preco` guardava antes) não
 * consegue dizer isso: existiriam três preços disputando a mesma linha.
 *
 * FORMATO — pares `<produtoId>=<tamanho em minúscula>`, ordenados por
 * produtoId, unidos por `|`:
 *
 *     "3f2a…=50x50|9c81…=queen"
 *
 * A ordenação por produtoId é o que faz a chave ser CANÔNICA: a mesma
 * combinação escrita em qualquer ordem de componentes dá o mesmo texto. Sem
 * isso, o preço cadastrado ficaria inalcançável dependendo da ordem em que a
 * tela montou a lista — o defeito silencioso que este módulo existe pra
 * evitar. O tamanho vai em minúscula pela mesma razão que `chave()` em
 * src/lib/preco.ts: a variação guarda o tamanho como TEXTO livre.
 *
 * SÓ COMPONENTE VARIÁVEL ENTRA. Componente de tamanho único seria idêntico em
 * toda linha do kit — não distingue nada e só engordaria a chave.
 *
 * OS DOIS RETORNOS ESPECIAIS, que não são a mesma coisa:
 *   - `""` (vazio): o kit NÃO TEM componente variável, então ele tem um preço
 *     só e essa é a chave dele. É o caso do Kit Manta + 2 Capas SIENA (capa
 *     só em 45x45, manta só em Manta). Chave válida, grava e lê normalmente.
 *   - `null`: FALTA escolher o tamanho de algum componente variável. Não há
 *     combinação, logo não há o que precificar — quem chama tem que tratar
 *     como "sem preço", nunca como chave vazia.
 */
export function chaveDeTamanhos(
  componentes: { produtoId: string }[],
  escolhas: EscolhasDeTamanho | null | undefined,
  tamanhosDe: TamanhosDe,
): string | null {
  const variaveis = componentesVariaveis(componentes, tamanhosDe)
  const pares: string[] = []
  for (const c of variaveis) {
    const t = tamanhoDoComponente(c.produtoId, escolhas, tamanhosDe)
    if (t === null) return null
    pares.push(`${c.produtoId}=${t.trim().toLowerCase()}`)
  }
  return pares.sort().join('|')
}

/**
 * A mesma chave, em texto pra gente ler ("Casal + 50x50"). Só apresentação:
 * NUNCA use isto como chave de nada — o nome do componente não é estável e
 * dois componentes podem ter o mesmo tamanho.
 */
export function descreverCombinacao(
  componentes: { produtoId: string; nome?: string }[],
  escolhas: EscolhasDeTamanho | null | undefined,
  tamanhosDe: TamanhosDe,
): string {
  const variaveis = componentesVariaveis(componentes, tamanhosDe)
  const tam = (produtoId: string) => tamanhoDoComponente(produtoId, escolhas, tamanhosDe) ?? '?'

  // Kit sem componente variável tem um preço só — dizer "tamanho único" é
  // mais honesto que deixar vazio, que leria como "faltou preencher".
  if (variaveis.length === 0) return 'tamanho único'
  // Com um componente variável o tamanho já identifica sozinho.
  if (variaveis.length === 1) return tam(variaveis[0]!.produtoId)
  // Com dois ou mais é obrigatório nomear: "Queen · 50x50" não diz qual
  // tamanho é de qual peça, e é justamente aí que o preço muda.
  return variaveis.map((c) => `${c.nome ?? 'componente'}: ${tam(c.produtoId)}`).join(' · ')
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
