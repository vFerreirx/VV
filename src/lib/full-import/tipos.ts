// Tipos compartilhados entre o parser (servidor) e a tela de conferência
// (cliente). Sem `server-only` de propósito.

// Erro de leitura com mensagem pronta pro usuário. O parser prefere PARAR a
// entregar uma leitura em que ele não confia — "se não tiver certeza, diz".
export class ErroLeitura extends Error {}

export type ItemLido = {
  // Chave do de-para: "Código ML" (WLJX97155) ou "Shopee SKU ID"
  // (47807599234_405675050747).
  codigo: string
  // SKU do vendedor como veio no PDF. No ML pode estar TRUNCADO em 50
  // caracteres pelo próprio marketplace — serve pro casamento automático e
  // pra detectar item alterado, nunca como chave.
  sku: string
  descricao: string
  // Shopee: "Âmbar Dourado" ou "Caqui,Queen". Vazio no ML.
  variacao: string
  quantidade: number
}

export type LeituraPdf = {
  canal: 'full_ml' | 'full_shopee'
  documento: string
  // ML: "72785017". Shopee: "INBRFSP12607220343".
  envioId: string | null
  itens: ItemLido[]
  // O total que o PRÓPRIO documento declara. É a rede de segurança: se a
  // soma das quantidades lidas não bater com ele, a importação é recusada.
  totalDeclarado: number
  totalLido: number
  avisos: string[]
}
