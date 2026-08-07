// Preço de TABELA do catálogo — helper PURO, sem acesso a banco: recebe os
// preços já carregados e devolve a sugestão pra uma linha do pedido.
//
// POR QUE AQUI É O CONTRÁRIO DO PESO (leia antes de "consertar"):
// o peso é SEMPRE recalculado na leitura, a partir do catálogo de agora —
// ver o comentário no topo de src/lib/peso.ts, que explica o porquê. Preço
// não. `orcamento_itens.preco_unitario` é SNAPSHOT do que foi negociado
// (ver o topo de src/lib/db/schema/orcamentos.ts): mudar o preço de tabela
// NÃO pode mexer em pedido já salvo, nem no de ontem nem no de cinco
// minutos atrás. Peso serve pra cotar frete e um valor errado precisa se
// corrigir sozinho; preço registra quanto se cobrou, e reescrever isso
// depois é falsificar documento.
//
// Por isso o que este módulo devolve é SUGESTÃO, não verdade: ela preenche
// o campo do builder e para por aí. O campo continua editável, e o que o
// vendedor deixar lá é o que vira snapshot.
//
// Em CENTAVOS inteiros: somar componente de kit em ponto flutuante acumula
// erro (0.1 + 0.2), e o valor final vai pra uma coluna numeric(12,2). A
// conversão pra "50,00" acontece só na borda.

import {
  combinacoesDeTamanho,
  tamanhoDoComponente,
  tamanhoDoKit,
  type TamanhosDe,
} from '@/lib/kit-tamanhos'

/** Preço de um par (produto|tamanho) ou (kit|tamanho), em centavos. */
export type TabelaDePrecos = {
  // Chave: `${produtoId}|${tamanhoNomeLower}`.
  produto: Record<string, number>
  // Chave: `${kitId}|${tamanhoNomeLower}`.
  kit: Record<string, number>
}

export const tabelaVazia = (): TabelaDePrecos => ({ produto: {}, kit: {} })

export function chave(donoId: string, tamanho: string | null | undefined) {
  return `${donoId}|${(tamanho ?? '').trim().toLowerCase()}`
}

/** numeric(12,2) do banco ("50.00") → centavos. */
export function decimalParaCentavos(valor: string): number {
  return Math.round(Number(valor) * 100)
}

/** Centavos → o "50,00" que o campo do builder espera. */
export function centavosParaMoeda(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// -----------------------------------------------------------------
// Sugestão para uma linha
// -----------------------------------------------------------------

/** Componente de kit já com o tamanho REAL resolvido pelo builder. */
export type ComponentePrecificavel = {
  produtoId: string
  quantidade: number
  // Vem de `tamanhoDoComponente` (orcamentos-view.tsx): a capa é 45x45
  // mesmo num kit Queen. Nulo quando o builder não conseguiu decidir.
  tamanho: string | null
}

// -----------------------------------------------------------------
// Preço na LISTA de produtos (/produtos)
// -----------------------------------------------------------------

// Não dá pra mostrar um número só: o preço mora no par (produto, tamanho) e
// a Peseira custa 50 no Casal, 60 no Queen e 70 no King. Daí a faixa — mesma
// forma de `pesoDeProduto` em src/lib/peso.ts, e pela mesma razão.
//
// A diferença é que aqui não existe "origem": preço não tem override no
// produto pra herdar do tamanho. Ou o par tem preço cadastrado, ou não tem.
export type TamanhoComPreco = { tamanho: string; centavos: number | null }

export type PrecoDeProduto = {
  min: number | null
  max: number | null
  // Tamanhos do produto ainda sem preço. Enquanto tiver algum aqui a faixa
  // exibida é parcial e não pode ser lida como "o preço do produto".
  semPreco: string[]
}

export function precoDeProdutoNaLista(
  tamanhosDoProduto: TamanhoComPreco[],
): PrecoDeProduto {
  const semPreco: string[] = []
  let min: number | null = null
  let max: number | null = null

  for (const t of tamanhosDoProduto) {
    if (t.centavos == null) {
      semPreco.push(t.tamanho)
      continue
    }
    min = min == null ? t.centavos : Math.min(min, t.centavos)
    max = max == null ? t.centavos : Math.max(max, t.centavos)
  }

  return { min, max, semPreco }
}

export function formatarPrecoDeProduto(p: PrecoDeProduto): string {
  if (p.min == null || p.max == null) return '—'
  if (p.min === p.max) return `R$ ${centavosParaMoeda(p.min)}`
  return `R$ ${centavosParaMoeda(p.min)}–${centavosParaMoeda(p.max)}`
}

// -----------------------------------------------------------------
// Preço na tela de KITS (/kits)
// -----------------------------------------------------------------

// O kit não guarda tamanho — ele é escolhido no pedido —, então aqui também
// é faixa. Mas, ao contrário do peso, a faixa NÃO sai de varrer os tamanhos
// de cada componente solto: sai de perguntar, pra cada tamanho que o kit
// pode assumir, quanto o pedido sugeriria. É a mesma `precoDeKit` que o
// builder chama, com a mesma resolução de tamanho por componente.
//
// A diferença importa: o Kit Peseira RELEVO tem preço só no Queen. Varrendo
// componentes soltos, a peseira apareceria "incompleta" e o kit inteiro
// viraria "—" — escondendo que em Queen o pedido sugere 90,00 sem hesitar.
export type PrecoDeKit = {
  min: number | null
  max: number | null
  // Pendências que impedem alguma combinação de fechar, já formatadas por
  // componente ("Peseira - RELEVO: Casal, King"). Por componente e não por
  // "tamanho do kit" porque desde que cada componente escolhe o seu, é o par
  // (componente, tamanho) que tem ou não preço.
  semPreco: string[]
}

export function precoDeKitNaLista(
  tabela: TabelaDePrecos,
  kitId: string,
  componentes: { produtoId: string; quantidade: number; nome?: string }[],
  tamanhosDe: TamanhosDe,
): PrecoDeKit {
  const semPreco: string[] = []
  for (const c of componentes) {
    const faltando = tamanhosDe(c.produtoId).filter(
      (t) => tabela.produto[chave(c.produtoId, t)] == null,
    )
    if (faltando.length > 0) {
      semPreco.push(`${c.nome ?? 'componente'}: ${faltando.join(', ')}`)
    }
  }

  // A faixa sai das combinações que FECHAM — uma escolha de tamanho por
  // componente variável. Percorrer combinações (e não cada componente
  // isolado) é o que faz o preço fechado do kit entrar na conta quando ele
  // existe, e é a mesma pergunta que o builder responde ao montar a linha.
  let min: number | null = null
  let max: number | null = null

  for (const escolhas of combinacoesDeTamanho(componentes, tamanhosDe)) {
    const valor = precoDeKit(
      tabela,
      kitId,
      tamanhoDoKit(componentes, escolhas, tamanhosDe),
      componentes.map((c) => ({
        ...c,
        tamanho: tamanhoDoComponente(c.produtoId, escolhas, tamanhosDe),
      })),
    )
    if (valor == null) continue
    min = min == null ? valor : Math.min(min, valor)
    max = max == null ? valor : Math.max(max, valor)
  }

  return { min, max, semPreco }
}

export function formatarPrecoDeKit(p: PrecoDeKit): string {
  if (p.min == null || p.max == null) return '—'
  if (p.min === p.max) return `R$ ${centavosParaMoeda(p.min)}`
  return `R$ ${centavosParaMoeda(p.min)}–${centavosParaMoeda(p.max)}`
}

// "sem preço em Casal, King" — diz QUAL tamanho está de fora, senão a faixa
// parece valer pro kit inteiro.
export function avisoPrecoDeKit(p: PrecoDeKit): string | null {
  if (p.semPreco.length === 0) return null
  return `sem preço em ${p.semPreco.join(', ')}`
}

// -----------------------------------------------------------------
// Sugestão para uma linha (continuação)
// -----------------------------------------------------------------

/** Preço de tabela de um produto avulso. Nulo = não cadastrado. */
export function precoDeProduto(
  tabela: TabelaDePrecos,
  produtoId: string | null | undefined,
  tamanho: string | null | undefined,
): number | null {
  if (!produtoId) return null
  return tabela.produto[chave(produtoId, tamanho)] ?? null
}

/**
 * Preço de um kit, na ordem da regra:
 *   1. preço FECHADO do kit naquele tamanho, se houver — ele vence a soma
 *      de propósito: quem cadastra um preço de kit está dizendo que o combo
 *      não custa a soma das partes (desconto, brinde embutido).
 *   2. SOMA dos componentes, cada um no tamanho dele.
 *
 * Um componente sem preço invalida a soma inteira, pela mesma razão do peso
 * (`pesoUnitarioDaLinha`): somar só os que têm devolveria um número menor
 * que o real, e um preço a menos passa batido na conferência — o "vazio"
 * aparece e alguém preenche.
 */
export function precoDeKit(
  tabela: TabelaDePrecos,
  kitId: string | null | undefined,
  tamanhoKit: string | null | undefined,
  componentes: ComponentePrecificavel[],
): number | null {
  if (!kitId) return null

  const fechado = tabela.kit[chave(kitId, tamanhoKit)]
  if (fechado != null) return fechado

  if (componentes.length === 0) return null
  let soma = 0
  for (const c of componentes) {
    // Tamanho indefinido = o builder não soube qual variação do componente
    // entra (acontece quando dois componentes têm tamanho variável). Sem
    // isso não há preço a somar.
    if (!c.tamanho) return null
    const unit = tabela.produto[chave(c.produtoId, c.tamanho)]
    if (unit == null) return null
    soma += unit * c.quantidade
  }
  return soma
}
