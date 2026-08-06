// Peso das peças de um pedido — helper PURO, sem acesso a banco: recebe o
// catálogo já carregado e devolve o peso de cada linha e o total.
//
// POR QUE O PESO NÃO É CONGELADO NO PEDIDO (leia antes de "consertar"):
// `preco_unitario` e `kit_componentes` são snapshot histórico DE PROPÓSITO
// (ver o comentário no topo de src/lib/db/schema/orcamentos.ts) — o pedido é
// documento e não pode mudar sozinho. O peso é o contrário: ele é SEMPRE
// recalculado na leitura, a partir do catálogo de agora. O motivo é
// prático — o cadastro de peso ainda está sendo preenchido, e ao corrigir o
// peso de um tamanho todos os pedidos, inclusive os antigos, têm que passar
// a mostrar o peso certo na hora. Peso serve pra cotar frete, não pra
// registrar quanto se cobrou. Se um dia o peso virar parte do valor
// negociado, aí sim vira snapshot — mas aí é outra decisão.
//
// Tudo em GRAMAS inteiras: somar inteiro não acumula erro de ponto
// flutuante, e a conversão pra kg acontece só na exibição.

export type ProdutoPeso = {
  id: string
  nome: string
  pesoGramas: number | null
}

export type TamanhoPeso = {
  nome: string
  pesoGramas: number | null
}

export type CatalogoPesos = {
  produtos: ProdutoPeso[]
  tamanhos: TamanhoPeso[]
}

// O mínimo que uma linha de pedido precisa ter pra ser pesada. Bate com
// OrcamentoItem, mas declarado à parte pra este módulo não depender do
// schema do banco.
export type ItemPesavel = {
  id: string
  descricao: string
  quantidade: number
  tamanho: string | null
  produtoId?: string | null
  kitComponentes:
    | {
        produtoNome: string
        quantidade: number
        tamanho?: string | null
        produtoId?: string | null
      }[]
    | null
}

export type ResumoPeso = {
  // Peso total da linha (unitário × quantidade), em gramas. null = não deu
  // pra resolver; a linha NÃO entra no total.
  porItem: Record<string, number | null>
  totalGramas: number
  itensSemPeso: number
}

// Índices montados uma vez por cálculo. As buscas por nome são
// case-insensitive porque o texto vem de descrição digitada/gerada, e
// "45x45" pode aparecer com qualquer caixa.
type Indices = {
  porId: Map<string, number | null>
  produtoPorNome: Map<string, number | null>
  tamanhoPorNome: Map<string, number | null>
  // Nomes ordenados do mais LONGO pro mais curto: no fallback por texto,
  // "Peseira - Aconchego" tem que ganhar de "Peseira", e o tamanho "Manta"
  // não pode roubar o casamento de um nome de produto que o contenha.
  nomesProduto: string[]
  nomesTamanho: string[]
}

function montarIndices(catalogo: CatalogoPesos): Indices {
  const porId = new Map<string, number | null>()
  const produtoPorNome = new Map<string, number | null>()
  for (const p of catalogo.produtos) {
    porId.set(p.id, p.pesoGramas)
    produtoPorNome.set(p.nome.toLowerCase(), p.pesoGramas)
  }

  const tamanhoPorNome = new Map<string, number | null>()
  for (const t of catalogo.tamanhos) {
    tamanhoPorNome.set(t.nome.toLowerCase(), t.pesoGramas)
  }

  const porTamanho = (a: string, b: string) => b.length - a.length
  return {
    porId,
    produtoPorNome,
    tamanhoPorNome,
    nomesProduto: [...produtoPorNome.keys()].sort(porTamanho),
    nomesTamanho: [...tamanhoPorNome.keys()].sort(porTamanho),
  }
}

// Peso unitário de UMA peça. A ordem é a da especificação, com uma regra que
// vale repetir: cada passo só encerra a busca se der peso NÃO-NULO. Casar o
// produto e ele não ter override é o caso comum — aí a busca continua pro
// tamanho, em vez de devolver "sem peso".
function pesoUnitario(
  ix: Indices,
  entrada: {
    produtoId?: string | null
    produtoNome?: string | null
    tamanho?: string | null
    descricao?: string | null
  },
): number | null {
  // 1. Vínculo com o produto (linhas novas e componentes de kit novos).
  if (entrada.produtoId) {
    const p = ix.porId.get(entrada.produtoId)
    if (p != null) return p
  }

  // 2. Nome exato do produto — é o que o snapshot de kit guarda, e o que
  //    sobra nas linhas legadas que só têm texto.
  if (entrada.produtoNome) {
    const p = ix.produtoPorNome.get(entrada.produtoNome.trim().toLowerCase())
    if (p != null) return p
  }

  // 3. Campo `tamanho` da linha/componente.
  if (entrada.tamanho) {
    const t = ix.tamanhoPorNome.get(entrada.tamanho.trim().toLowerCase())
    if (t != null) return t
  }

  // 4. Fallback por TEXTO da descrição. É o que faz os 371 itens antigos
  //    funcionarem: eles guardam só "Peseira - Aconchego Casal". Produto
  //    antes de tamanho, e nome mais longo primeiro.
  if (entrada.descricao) {
    const alvo = entrada.descricao.toLowerCase()
    for (const nome of ix.nomesProduto) {
      if (alvo.includes(nome)) {
        const p = ix.produtoPorNome.get(nome)
        if (p != null) return p
        // Casou o produto mas ele não tem override: para de procurar
        // produto e vai pro tamanho.
        break
      }
    }
    for (const nome of ix.nomesTamanho) {
      if (alvo.includes(nome)) {
        const t = ix.tamanhoPorNome.get(nome)
        if (t != null) return t
        break
      }
    }
  }

  // 5. Não resolveu.
  return null
}

// Linha que É um kit mas não tem os componentes gravados. Acontece com 136
// linhas antigas: "Kit Peseira King + 2 Capas de Almofada 45x45 - …", sem
// `kit_componentes` e sem `kit_id` — só o texto.
//
// Elas NÃO podem cair no fallback por descrição: ali o texto casaria com o
// tamanho "45x45" e devolveria 350 g, o peso de UMA capa, quando o kit
// inteiro pesa mais de 2 kg. Um peso plausível e errado é pior que peso
// nenhum — o errado some calado na cotação do frete, o nenhum aparece no
// aviso e alguém arruma.
const PREFIXO_KIT = /^\s*kit\b/i

// Peso de UMA unidade da linha (sem multiplicar pela quantidade do item).
function pesoUnitarioDaLinha(ix: Indices, item: ItemPesavel): number | null {
  const componentes = item.kitComponentes
  if ((!componentes || componentes.length === 0) && PREFIXO_KIT.test(item.descricao)) {
    return null
  }
  if (componentes && componentes.length > 0) {
    let soma = 0
    for (const c of componentes) {
      const unit = pesoUnitario(ix, {
        produtoId: c.produtoId,
        produtoNome: c.produtoNome,
        // Tamanho do COMPONENTE (a capa é 45x45 mesmo num kit Queen), com o
        // mesmo fallback pro tamanho do item usado na via de separação.
        tamanho: c.tamanho ?? item.tamanho,
        descricao: c.produtoNome,
      })
      // Um componente sem peso invalida o kit inteiro: somar só os que têm
      // devolveria um número menor que o real, e um peso a menos no frete é
      // pior do que peso nenhum — este mente calado, aquele avisa.
      if (unit == null) return null
      soma += unit * c.quantidade
    }
    return soma
  }

  return pesoUnitario(ix, {
    produtoId: item.produtoId,
    tamanho: item.tamanho,
    descricao: item.descricao,
  })
}

export function calcularPesos(
  itens: ItemPesavel[],
  catalogo: CatalogoPesos,
): ResumoPeso {
  const ix = montarIndices(catalogo)
  const porItem: Record<string, number | null> = {}
  let totalGramas = 0
  let itensSemPeso = 0

  for (const item of itens) {
    const unit = pesoUnitarioDaLinha(ix, item)
    if (unit == null) {
      porItem[item.id] = null
      itensSemPeso++
      continue
    }
    const daLinha = unit * item.quantidade
    porItem[item.id] = daLinha
    totalGramas += daLinha
  }

  return { porItem, totalGramas, itensSemPeso }
}

// -----------------------------------------------------------------
// Formatação
// -----------------------------------------------------------------

// Peça em gramas ("350 g"); o total vai em kg com 3 casas ("1,350 kg"),
// que é como transportadora cota.
export function formatarGramas(g: number | null): string {
  if (g == null) return '—'
  return `${g.toLocaleString('pt-BR')} g`
}

export function formatarKg(gramas: number): string {
  return `${(gramas / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} kg`
}

// "2 itens sem peso cadastrado" — o total não pode parecer completo quando
// não é.
export function avisoSemPeso(itensSemPeso: number): string | null {
  if (itensSemPeso === 0) return null
  return itensSemPeso === 1
    ? '1 item sem peso cadastrado'
    : `${itensSemPeso} itens sem peso cadastrado`
}

// -----------------------------------------------------------------
// Peso na LISTA de produtos (/produtos)
// -----------------------------------------------------------------

// A coluna "Peso" do cadastro espelha os passos 1 e 3 de `pesoUnitario`: o
// override do produto vence, e sem ele vale o peso do TAMANHO. Mostrar só o
// override deixaria a coluna quase toda vazia e faria parecer que não há
// peso cadastrado, quando o pedido resolve o peso pelo tamanho e soma
// normalmente.
//
// Não dá pra devolver um número só: um produto pode ter vários tamanhos (a
// Peseira existe em Casal, King e Queen) e cada um pesa o seu. Daí a faixa.
export type TamanhoDoProduto = { tamanho: string; pesoGramas: number | null }

export type PesoDeProduto = {
  origem: 'produto' | 'tamanho' | 'nenhum'
  // Faixa dos pesos conhecidos; min === max quando só existe um valor.
  min: number | null
  max: number | null
  // Tamanhos do produto ainda sem peso. Enquanto tiver algum aqui o número
  // exibido é parcial e não pode ser lido como "o peso do produto".
  semPeso: string[]
}

export function pesoDeProduto(
  pesoGramas: number | null,
  tamanhosDoProduto: TamanhoDoProduto[],
): PesoDeProduto {
  // Override do produto: vale pra todos os tamanhos, então não há faixa nem
  // pendência a apontar.
  if (pesoGramas != null) {
    return { origem: 'produto', min: pesoGramas, max: pesoGramas, semPeso: [] }
  }

  const semPeso: string[] = []
  let min: number | null = null
  let max: number | null = null
  for (const t of tamanhosDoProduto) {
    if (t.pesoGramas == null) {
      semPeso.push(t.tamanho)
      continue
    }
    min = min == null ? t.pesoGramas : Math.min(min, t.pesoGramas)
    max = max == null ? t.pesoGramas : Math.max(max, t.pesoGramas)
  }

  return { origem: min == null ? 'nenhum' : 'tamanho', min, max, semPeso }
}

export function formatarPesoDeProduto(p: PesoDeProduto): string {
  if (p.min == null || p.max == null) return '—'
  if (p.min === p.max) return formatarGramas(p.min)
  return `${p.min.toLocaleString('pt-BR')}–${formatarGramas(p.max)}`
}

// -----------------------------------------------------------------
// Peso na tela de KITS (/kits)
// -----------------------------------------------------------------

// O kit não guarda tamanho: `kit_itens` aponta pro PRODUTO e o tamanho só é
// escolhido ao gerar as OPs. Então o peso de um kit é a soma dos
// componentes, e quando um componente existe em vários tamanhos que pesam
// diferente (a Peseira em Casal/King/Queen) o resultado é uma faixa.
export type ComponenteDeKit = {
  produtoNome: string
  quantidade: number
  // Override do produto, se houver.
  pesoGramas: number | null
  tamanhosPeso: TamanhoDoProduto[]
}

export type PesoDeKit = {
  min: number | null
  max: number | null
  // Componentes cujo peso não dá pra resolver por completo. Enquanto tiver
  // algum aqui, `min`/`max` ficam nulos — ver o porquê logo abaixo.
  semPeso: string[]
}

export function pesoDeKit(componentes: ComponenteDeKit[]): PesoDeKit {
  const semPeso: string[] = []
  let min = 0
  let max = 0

  for (const c of componentes) {
    const p = pesoDeProduto(c.pesoGramas, c.tamanhosPeso)
    // Um componente só conta como resolvido quando TODOS os tamanhos dele
    // têm peso: se a Peseira só foi pesada no Casal, o kit em King fica sem
    // resposta e a faixa mentiria pra baixo.
    if (p.min == null || p.max == null || p.semPeso.length > 0) {
      semPeso.push(c.produtoNome)
      continue
    }
    min += p.min * c.quantidade
    max += p.max * c.quantidade
  }

  // Mesma regra do pedido (ver `pesoUnitarioDaLinha`): um componente sem
  // peso zera o kit inteiro em vez de somar só o que dá. Um total parcial
  // parece completo e some calado na cotação do frete; o "—" aparece e
  // alguém vai lá cadastrar o que falta.
  if (semPeso.length > 0) return { min: null, max: null, semPeso }

  return { min, max, semPeso }
}

function kgSemUnidade(gramas: number): string {
  return (gramas / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

// Kit vai em kg: é o peso do que se despacha, e é assim que transportadora
// cota. O detalhe por componente, esse sim, fica em gramas.
export function formatarPesoDeKit(p: PesoDeKit): string {
  if (p.min == null || p.max == null) return '—'
  if (p.min === p.max) return formatarKg(p.min)
  return `${kgSemUnidade(p.min)}–${formatarKg(p.max)}`
}

// "falta peso em Manta - SIENA" — diz QUAL componente segurar, senão o "—"
// não ajuda ninguém a resolver.
export function avisoPesoDeKit(p: PesoDeKit): string | null {
  if (p.semPeso.length === 0) return null
  return `falta peso em ${p.semPeso.join(', ')}`
}
