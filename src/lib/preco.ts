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
