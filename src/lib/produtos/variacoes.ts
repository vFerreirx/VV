// BUSCAR E AGRUPAR VARIAÇÕES — a lista que ficou grande demais pra rolar.
//
// A capa ACONCHEGO tem 58 variações, a peseira LINKS 57, e ARAN, 3D e
// ACONCHEGO têm 45 cada. Tudo num formulário só, sem busca: achar "a Marsala
// Queen" era rolar até encontrar, e trocar o SKU errado é o tipo de engano que
// só aparece na hora de gerar a OP.
//
// Regras puras, sem React: a tela decide o que ESCONDER, não o que existir —
// ver o cuidado com `useFieldArray` em produto-form.tsx.

export type VariacaoParaLista = {
  skuVariacao: string
  cor: string | null
  modelo: string | null
  tamanho: string | null
}

/**
 * Normaliza pra comparar: sem caixa, sem acento e sem espaço nas pontas.
 *
 * ⚠️ SEM ACENTO É O PONTO. O catálogo tem "Cáqui", "Grafite Médio", "Verde
 * Musgo" — quem digita rápido escreve "caqui" e "medio", e uma busca que
 * exige o acento não acha nada justamente no nome mais comprido. `NFD` separa
 * a letra do acento e o `replace` joga o acento fora.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * A variação casa com o termo? Procura em SKU, cor, modelo e tamanho.
 *
 * Termo vazio casa com tudo — é o estado normal da tela, sem filtro.
 *
 * Cada PALAVRA do termo precisa aparecer em algum campo, e não a frase
 * inteira num campo só: "marsala queen" tem que achar a variação cuja cor é
 * Marsala e cujo tamanho é Queen, que é exatamente como a pessoa procura.
 */
export function casaComBusca(v: VariacaoParaLista, termo: string): boolean {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return true
  const alvo = normalizar(
    [v.skuVariacao, v.cor, v.modelo, v.tamanho].filter(Boolean).join(' '),
  )
  return palavras.every((p) => alvo.includes(p))
}

export type GrupoDeCor<T> = {
  /** O nome como está cadastrado; '' quando a variação não tem cor. */
  cor: string
  itens: T[]
}

/**
 * Agrupa por COR, que é como o catálogo é pensado: a peseira existe em
 * Marsala, Caqui, Grafite… e dentro de cada cor vêm os tamanhos.
 *
 * ⚠️ A ORDEM DE DENTRO É A DO CADASTRO DE TAMANHOS, não alfabética: "Casal,
 * Queen, King" é a ordem que a fábrica fala, e "Casal, King, Queen" faria
 * procurar. Quem não está na lista de tamanhos vai pro fim, na ordem em que
 * apareceu — variação com tamanho digitado à mão não pode sumir.
 *
 * As cores saem na ordem em que aparecem na lista recebida: é a ordem do
 * cadastro, a mesma que a pessoa vê ao rolar hoje.
 */
export function agruparPorCor<T extends VariacaoParaLista>(
  variacoes: readonly T[],
  ordemDosTamanhos: readonly string[] = [],
): GrupoDeCor<T>[] {
  const posicao = new Map(
    ordemDosTamanhos.map((t, i) => [normalizar(t), i]),
  )
  const ordemDoTamanho = (v: VariacaoParaLista) =>
    posicao.get(normalizar(v.tamanho ?? '')) ?? Number.MAX_SAFE_INTEGER

  const grupos = new Map<string, GrupoDeCor<T>>()
  for (const v of variacoes) {
    const cor = v.cor ?? ''
    const grupo = grupos.get(cor) ?? { cor, itens: [] }
    grupo.itens.push(v)
    grupos.set(cor, grupo)
  }

  for (const grupo of grupos.values()) {
    // `map`+`sort` com índice guardado: ordenação estável em qualquer motor,
    // e o empate (dois fora da lista de tamanhos) preserva o cadastro.
    grupo.itens = grupo.itens
      .map((item, i) => ({ item, i }))
      .sort((a, b) => {
        const t = ordemDoTamanho(a.item) - ordemDoTamanho(b.item)
        return t !== 0 ? t : a.i - b.i
      })
      .map(({ item }) => item)
  }

  return [...grupos.values()]
}

/** "58 variações · 12 cores" — o cabeçalho da seção. */
export function resumoDaLista(variacoes: readonly VariacaoParaLista[]): string {
  const cores = new Set(variacoes.map((v) => normalizar(v.cor ?? '')))
  const n = variacoes.length
  const c = cores.size
  return `${n} ${n === 1 ? 'variação' : 'variações'} · ${c} ${c === 1 ? 'cor' : 'cores'}`
}
