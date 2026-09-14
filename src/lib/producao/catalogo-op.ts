// A OP guarda UMA variação real do catálogo. Filtrar por modelo antes de
// tamanho/cor evita montar uma combinação que pertence a outro modelo do produto.
export type VariacaoDoCatalogo = {
  id: string
  modelo: string | null
  tamanho: string | null
  cor: string | null
  skuVariacao: string
}

export const SEM_MODELO = 'Sem modelo'

export function modelosDoProduto(produto: { variacoes: VariacaoDoCatalogo[] }): string[] {
  return [
    ...new Set(
      produto.variacoes.length
        ? produto.variacoes.map((v) => v.modelo || SEM_MODELO)
        : [SEM_MODELO],
    ),
  ]
}

export function variacoesDoModelo(variacoes: VariacaoDoCatalogo[], modelo: string) {
  return variacoes.filter((v) => (v.modelo || SEM_MODELO) === modelo)
}

export function erroDaVariacao(
  variacaoId: string | null | undefined,
  disponiveis: readonly { id: string }[],
): string | null {
  if (!variacaoId) return disponiveis.length ? 'Escolha o tamanho e a cor do produto' : null
  return disponiveis.some((v) => v.id === variacaoId)
    ? null
    : 'A variação não está disponível para este produto. Selecione novamente no catálogo.'
}
