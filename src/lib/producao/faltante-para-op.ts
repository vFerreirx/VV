// DO FALTANTE DO PEDIDO PRA UMA VARIAÇÃO DO CATÁLOGO — regra pura, sem banco.
//
// A via de faltantes guarda cada linha pela CHAVE `produto|tamanho|cor`
// (src/lib/separacao.ts, bloco "A CHAVE DA LINHA"), normalizada: sem espaço
// sobrando e sem diferença de caixa. Pra produzir, a OP precisa de UMA
// variação real do catálogo — e o caminho de uma pra outra só vale quando é
// inequívoco.
//
// ⚠️ NÃO CHUTA. Texto escrito à mão, produto com nome repetido, peça sem cor
// num produto que tem cores, variação apagada: em todos esses casos a função
// devolve o MOTIVO, e o botão "Produzir" fica desabilitado dizendo qual é.
// Uma OP da peça errada é pior do que nenhuma: o operador tece, e ninguém
// percebe até a separação não bater de novo.
//
// ⚠️ A NORMALIZAÇÃO É A MESMA DE separacao.ts (`normalizar`). Se as duas
// divergirem, toda chave deixa de casar sem erro nenhum — só o botão fica
// desabilitado pra sempre.

export type ProdutoParaResolver = {
  id: string
  nome: string
  /** 'parceiro' = comprado pronto: resolve, mas não vira OP. */
  origem?: string
  variacoes: readonly {
    id: string
    cor: string | null
    tamanho: string | null
  }[]
}

export type ResolucaoDoFaltante =
  | { ok: true; produtoId: string; variacaoId: string }
  | { ok: false; motivo: string }

const normalizar = (s: string | null | undefined): string =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * A variação do catálogo que a linha de faltante representa, ou o motivo de
 * não dar pra saber. `produtos` é o catálogo ATIVO (sem produto nem variação
 * excluídos) — `listarProdutosParaOrdem({ somenteAtivas: true })`, COM os de
 * parceiro: é aqui que eles ganham o motivo certo (ver abaixo).
 */
export function resolverVariacaoDoFaltante(
  chave: string,
  produtos: readonly ProdutoParaResolver[],
): ResolucaoDoFaltante {
  // `?|` é a linha sem trio confiável: a chave é a descrição escrita à mão.
  if (chave.startsWith('?|')) {
    return {
      ok: false,
      motivo: 'Item escrito à mão: não dá pra saber qual peça do catálogo é',
    }
  }
  const partes = chave.split('|')
  if (partes.length !== 3) {
    return {
      ok: false,
      motivo: 'Item escrito à mão: não dá pra saber qual peça do catálogo é',
    }
  }
  const [produto, tamanho, cor] = partes as [string, string, string]

  const candidatos = produtos.filter((p) => normalizar(p.nome) === produto)
  if (candidatos.length === 0) {
    return { ok: false, motivo: 'Produto fora do catálogo (ou excluído)' }
  }
  if (candidatos.length > 1) {
    return { ok: false, motivo: 'Mais de um produto com esse nome' }
  }
  const p = candidatos[0]!

  // PRODUTO DE PARCEIRO É ACHADO, E RECUSADO PELO NOME CERTO. Tirá-lo da lista
  // (`semParceiro`) faria o suéter cair em "fora do catálogo" — mentira, e o
  // gerente iria procurar o que não sumiu. O que falta é pedir ao parceiro.
  if (p.origem === 'parceiro') {
    return {
      ok: false,
      motivo: 'Comprado de parceiro — não vira OP. Peça ao parceiro.',
    }
  }

  // Peça sem cor num produto que só tem variações COM cor: é o kit antigo
  // sem cor gravada. Qualquer uma seria chute.
  if (cor === '' && p.variacoes.some((v) => normalizar(v.cor) !== '')) {
    const semCor = p.variacoes.filter(
      (v) => normalizar(v.cor) === '' && normalizar(v.tamanho) === tamanho,
    )
    if (semCor.length === 0) {
      return { ok: false, motivo: 'Peça sem cor definida no pedido' }
    }
  }

  const variacoes = p.variacoes.filter(
    (v) => normalizar(v.tamanho) === tamanho && normalizar(v.cor) === cor,
  )
  if (variacoes.length === 0) {
    return {
      ok: false,
      motivo: 'Esse tamanho/cor não existe mais no catálogo',
    }
  }
  if (variacoes.length > 1) {
    return { ok: false, motivo: 'Mais de uma variação casa com essa peça' }
  }
  return { ok: true, produtoId: p.id, variacaoId: variacoes[0]!.id }
}
