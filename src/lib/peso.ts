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

// Chave do par, no mesmo formato de `chave()` em src/lib/preco.ts.
// Duplicada de propósito: peso e preço têm o mesmo eixo mas destinos
// opostos (este é recalculado na leitura, aquele é snapshot), e um import
// entre os dois criaria um acoplamento que não existe de verdade.
export function chavePeso(dono: string, tamanho: string): string {
  return `${dono.trim().toLowerCase()}|${tamanho.trim().toLowerCase()}`
}

export type TamanhoPeso = {
  nome: string
  pesoGramas: number | null
}

// Espelha `TabelaDePrecos` (src/lib/preco.ts): o peso vive no par
// (produto, tamanho), então o índice é por par.
export type CatalogoPesos = {
  /** `${produtoId}|${tamanho}` -> gramas. */
  porId: Record<string, number>
  /** `${produtoNome}|${tamanho}` -> gramas. Snapshot de kit e linhas legadas. */
  porNome: Record<string, number>
  /** `${tamanho}` -> gramas. O padrão, quando o par não tem peso próprio. */
  porTamanho: Record<string, number>
  /**
   * Nomes conhecidos, pro fallback por texto. Do mais LONGO pro mais curto:
   * "Peseira - Aconchego" tem que ganhar de "Peseira".
   */
  nomesProduto: string[]
  nomesTamanho: string[]
}

export function catalogoVazio(): CatalogoPesos {
  return {
    porId: {},
    porNome: {},
    porTamanho: {},
    nomesProduto: [],
    nomesTamanho: [],
  }
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

// Peso unitário de UMA peça. A ordem é a da especificação, com uma regra que
// vale repetir: cada passo só encerra a busca se der peso NÃO-NULO. Casar o
// par e ele não ter peso próprio é o caso comum — aí a busca continua pro
// tamanho, em vez de devolver "sem peso".
//
// SEM TAMANHO NÃO HÁ RESPOSTA. Casar só o produto não basta: "Peseira -
// ACONCHEGO" pesa 950, 1100 ou 1200 conforme o tamanho, e devolver qualquer
// um deles seria um número plausível e errado — que some calado na cotação
// do frete, enquanto o "sem peso" aparece e alguém resolve.
function pesoUnitario(
  catalogo: CatalogoPesos,
  entrada: {
    produtoId?: string | null
    produtoNome?: string | null
    tamanho?: string | null
    descricao?: string | null
  },
): number | null {
  const tam = entrada.tamanho?.trim().toLowerCase() ?? ''

  if (tam) {
    // 1. Par (produtoId, tamanho) — linhas novas e componentes de kit novos.
    if (entrada.produtoId) {
      const p = catalogo.porId[chavePeso(entrada.produtoId, tam)]
      if (p != null) return p
    }

    // 2. Par (produtoNome, tamanho) — é o que o snapshot de kit guarda, e o
    //    que sobra nas linhas legadas que só têm texto.
    if (entrada.produtoNome) {
      const p = catalogo.porNome[chavePeso(entrada.produtoNome, tam)]
      if (p != null) return p
    }

    // 3. Peso do TAMANHO: o padrão, quando o par não tem peso próprio.
    const t = catalogo.porTamanho[tam]
    if (t != null) return t
  }

  // 4. Fallback por TEXTO da descrição. É o que faz os itens antigos
  //    funcionarem: eles guardam só "Peseira - Aconchego Casal". Extrai
  //    produto E tamanho e tenta o par; achando só o tamanho, vale o peso
  //    dele.
  if (entrada.descricao) {
    const alvo = entrada.descricao.toLowerCase()
    const doTexto = catalogo.nomesTamanho.find((n) => alvo.includes(n))
    if (doTexto) {
      const produto = catalogo.nomesProduto.find((n) => alvo.includes(n))
      if (produto) {
        const p = catalogo.porNome[chavePeso(produto, doTexto)]
        if (p != null) return p
      }
      const t = catalogo.porTamanho[doTexto]
      if (t != null) return t
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
// tamanho "45x45" e devolveria 200 g, o peso de UMA capa, quando o kit
// inteiro pesa mais de 2 kg. Um peso plausível e errado é pior que peso
// nenhum — o errado some calado na cotação do frete, o nenhum aparece no
// aviso e alguém arruma.
const PREFIXO_KIT = /^\s*kit\b/i

// Peso de UMA unidade da linha (sem multiplicar pela quantidade do item).
function pesoUnitarioDaLinha(catalogo: CatalogoPesos, item: ItemPesavel): number | null {
  const componentes = item.kitComponentes
  if ((!componentes || componentes.length === 0) && PREFIXO_KIT.test(item.descricao)) {
    return null
  }
  if (componentes && componentes.length > 0) {
    let soma = 0
    for (const c of componentes) {
      const unit = pesoUnitario(catalogo, {
        produtoId: c.produtoId,
        produtoNome: c.produtoNome,
        // Tamanho do COMPONENTE (a capa é 45x45 mesmo num kit Queen), com o
        // mesmo fallback pro tamanho do item usado na via de separação —
        // é o que mantém os pedidos antigos funcionando, quando o tamanho
        // vivia só no nível do kit.
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

  return pesoUnitario(catalogo, {
    produtoId: item.produtoId,
    tamanho: item.tamanho,
    descricao: item.descricao,
  })
}

export function calcularPesos(itens: ItemPesavel[], catalogo: CatalogoPesos): ResumoPeso {
  const porItem: Record<string, number | null> = {}
  let totalGramas = 0
  let itensSemPeso = 0

  for (const item of itens) {
    const unit = pesoUnitarioDaLinha(catalogo, item)
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

// A coluna "Peso" do cadastro mostra o peso EFETIVO de cada tamanho — o do
// par (produto, tamanho) quando existe, senão o do tamanho. É a mesma cadeia
// dos passos 1 e 3 de `pesoUnitario`, e por isso o número da tela é o que o
// pedido vai somar.
//
// Não dá pra devolver um número só: um produto pode ter vários tamanhos (a
// Peseira existe em Casal, King e Queen) e cada um pesa o seu. Daí a faixa.
// (Era exatamente isso que o antigo `produtos.peso_gramas` não conseguia
// dizer — ver supabase/sql/40_peso_produto_tamanho.sql.)
export type TamanhoDoProduto = { tamanho: string; pesoGramas: number | null }

export type PesoDeProduto = {
  // Faixa dos pesos conhecidos; min === max quando só existe um valor.
  min: number | null
  max: number | null
  // Tamanhos do produto ainda sem peso. Enquanto tiver algum aqui o número
  // exibido é parcial e não pode ser lido como "o peso do produto".
  semPeso: string[]
}

export function pesoDeProduto(tamanhosDoProduto: TamanhoDoProduto[]): PesoDeProduto {
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

  return { min, max, semPeso }
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
  // Peso EFETIVO de cada tamanho do componente (par (produto, tamanho)
  // quando existe, senao o do tamanho).
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
    const p = pesoDeProduto(c.tamanhosPeso)
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
