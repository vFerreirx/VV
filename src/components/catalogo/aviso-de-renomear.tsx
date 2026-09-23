type UsoPorNome = Record<string, { variacoes: number; produtos: number }>

/**
 * O QUE O NOME NOVO VAI MEXER — dito ANTES de salvar, no diálogo de editar.
 *
 * - Cor e modelo (`modo="propaga"`): renomear leva as variações que usam o
 *   nome antigo, na mesma transação (src/lib/db/renomear-no-catalogo.ts). São
 *   dezenas de linhas de produtos que a pessoa não está vendo.
 * - Tamanho (`modo="recusa"`): renomear em uso é recusado pela action
 *   (`erroAoRenomearTamanho`). O aviso adianta a recusa pro que a tela sabe —
 *   as variações; a action ainda confere pedidos e preço de kit.
 *
 * O número é o contador da linha (`uso…NasVariacoes`), que conta as mesmas
 * variações vivas que o UPDATE altera.
 */
export function AvisoDeRenomear({
  nomeAtual,
  nomeNovo,
  uso,
  modo,
}: {
  nomeAtual: string
  nomeNovo: string
  uso: UsoPorNome
  modo: 'propaga' | 'recusa'
}) {
  const novo = nomeNovo.trim()
  if (!novo || novo === nomeAtual.trim()) return null
  const n = uso[nomeAtual.trim().toLowerCase()]
  if (!n || n.variacoes === 0) return null

  const quantas = `${n.variacoes} ${n.variacoes === 1 ? 'variação' : 'variações'}${
    n.produtos > 1 ? ` de ${n.produtos} produtos` : ''
  }`
  if (modo === 'recusa') {
    return (
      <p className="text-destructive text-xs">
        &ldquo;{nomeAtual}&rdquo; está em {quantas}: o nome não pode mudar. Ele
        é a chave do preço de kit e do peso no pedido.
      </p>
    )
  }
  return (
    <p className="text-xs text-amber-600">
      Vai atualizar {quantas} de &ldquo;{nomeAtual}&rdquo; pra &ldquo;{novo}
      &rdquo;. O SKU não muda.
    </p>
  )
}
