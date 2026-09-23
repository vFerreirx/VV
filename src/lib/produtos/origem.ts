// DE ONDE VEM O PRODUTO: a fábrica produz, ou é comprado pronto de um parceiro.
//
// Nasceu do SUÉTER, o primeiro produto que a fábrica NÃO produz. Até ele, o
// sistema supunha que todo produto do catálogo era fabricado — e o oferecia
// na Nova OP, no kit, no Full e na reposição → OP.
//
// ⚠️ PRODUTO DE PARCEIRO NUNCA VIRA OP. A tela esconde (a opção `semParceiro`
// de `listarProdutosParaOrdem`), mas a tela pode mentir: toda action que CRIA
// OP pergunta aqui, pela guarda de src/lib/db/origem-do-produto.ts. Quem só
// VENDE ou REGISTRA (pedido, cadastro de kit, marcar peça acabando) continua
// vendo o produto normalmente.
//
// Não existe cadastro de fornecedor: é UM parceiro só. Se vier o segundo, é
// aqui (e numa coluna `parceiro_id` ao lado de `produtos.origem`) que ele
// entra.
//
// ⚠️ A TUPLA TEM CÓPIA NO BANCO: o CHECK `produtos_origem_ck` da
// supabase/sql/72_origem_e_grupo_de_tamanho.sql.
//
// Lógica pura, sem banco: testada em src/lib/producao/regras.test.ts.

export const ORIGENS_DE_PRODUTO = ['producao', 'parceiro'] as const
export type OrigemDoProduto = (typeof ORIGENS_DE_PRODUTO)[number]

export const ROTULO_DA_ORIGEM: Record<OrigemDoProduto, string> = {
  producao: 'Produzimos',
  parceiro: 'Comprado de parceiro',
}

export function ehOrigemValida(v: unknown): v is OrigemDoProduto {
  return (
    typeof v === 'string' && (ORIGENS_DE_PRODUTO as readonly string[]).includes(v)
  )
}

/**
 * A recusa de OP por origem: null quando todos os produtos são produzidos,
 * senão a frase que a action devolve — dizendo QUAL produto, porque no kit
 * (vários componentes) "um deles é de parceiro" não ajuda ninguém.
 */
export function erroDeOrigemParaOp(
  produtos: readonly { nome: string; origem: string }[],
): string | null {
  const deParceiro = [
    ...new Set(produtos.filter((p) => p.origem === 'parceiro').map((p) => p.nome)),
  ]
  if (deParceiro.length === 0) return null
  if (deParceiro.length === 1) {
    return `"${deParceiro[0]}" é comprado de parceiro — não vira OP.`
  }
  const nomes = deParceiro.map((n) => `"${n}"`).join(', ')
  return `${nomes} são comprados de parceiro — não viram OP.`
}
