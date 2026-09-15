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

// ⚠️ VARIAÇÃO É SEMPRE OBRIGATÓRIA. Antes, produto sem variação cadastrada
// aceitava OP sem variação — e uma OP sem cor nem tamanho não diz ao operador
// o que tecer. Produto novo sem variação tem que ganhar a variação no
// cadastro antes de virar OP.
export function erroDaVariacao(
  variacaoId: string | null | undefined,
  disponiveis: readonly { id: string }[],
): string | null {
  if (!variacaoId) {
    return disponiveis.length
      ? 'Escolha o tamanho e a cor do produto'
      : 'Este produto não tem variação cadastrada. Cadastre a variação antes de criar a OP.'
  }
  return disponiveis.some((v) => v.id === variacaoId)
    ? null
    : 'A variação não está disponível para este produto. Selecione novamente no catálogo.'
}

// ─────────────────────────────────────────────────────────────────────────
// A BUSCA ÚNICA POR VARIAÇÃO
// ─────────────────────────────────────────────────────────────────────────
//
// O percurso modelo → produto → tamanho → cor é certo pra quem não sabe o
// que procura, e lento pra quem sabe: no dia da virada o gerente vai
// cadastrar dezenas de OPs do Trello, e cada uma é "peseira marsala queen".
// Aqui ele digita qualquer pedaço e escolhe a VARIAÇÃO direto.
//
// ⚠️ TODO PEDAÇO PRECISA CASAR, em qualquer campo. "peseira marsala queen"
// acha a variação que tem as três palavras espalhadas por produto, cor e
// tamanho; "marsala" sozinho lista todas as marsala. Sem acento e sem
// maiúscula, porque o catálogo tem "Âmbar" e ninguém digita o circunflexo.
//
// No CLIENTE, sobre o que `listarProdutosParaOrdem` já trouxe (~470
// variações): uma request por tecla seria a lista piscando a cada letra.

export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
}

/** Produto + modelo que restringem a busca depois de "criar e continuar". */
export type EscopoDaBusca = { produtoId: string; modelo: string }

type ProdutoBuscavel = {
  id: string
  nome: string
  sku: string
  variacoes: VariacaoDoCatalogo[]
}

// O tipo da variação SAI do produto (`P['variacoes'][number]`), e não de um
// segundo genérico: assim quem chama recebe de volta a variação com os campos
// que mandou (o hex da cor, no "Nova OP"), sem cast.
export function buscarVariacoes<P extends ProdutoBuscavel>(
  produtos: readonly P[],
  termo: string,
  { escopo = null, limite = 50 }: { escopo?: EscopoDaBusca | null; limite?: number } = {},
): { itens: { produto: P; variacao: P['variacoes'][number] }[]; total: number } {
  const pedacos = normalizarBusca(termo).split(/\s+/).filter(Boolean)
  // Sem nada digitado e sem escopo, nada: listar 470 variações não ajuda
  // ninguém a escolher uma.
  if (pedacos.length === 0 && !escopo) return { itens: [], total: 0 }

  const achados: { produto: P; variacao: P['variacoes'][number] }[] = []
  for (const produto of produtos) {
    if (escopo && produto.id !== escopo.produtoId) continue
    for (const variacao of produto.variacoes) {
      if (escopo && (variacao.modelo || SEM_MODELO) !== escopo.modelo) continue
      const texto = normalizarBusca(
        [
          produto.nome,
          produto.sku,
          variacao.modelo,
          variacao.cor,
          variacao.tamanho,
          variacao.skuVariacao,
        ]
          .filter(Boolean)
          .join(' '),
      )
      if (pedacos.every((p) => texto.includes(p))) {
        achados.push({ produto, variacao })
      }
    }
  }
  return { itens: achados.slice(0, limite), total: achados.length }
}
