// As linhas da VIA DE SEPARAÇÃO — helper PURO, sem acesso a banco: recebe os
// itens do pedido e o catálogo já carregado, devolve as linhas somadas e na
// ordem em que se separa de verdade.
//
// O QUE ESTE MÓDULO RESOLVE: a lista saía na ordem de primeira aparição, que
// é a ordem em que os kits foram digitados. Num pedido com dois modelos isso
// intercala capa/peseira/capa/peseira, e quem separa anda o estoque inteiro
// duas vezes. Agrupando por MODELO e, dentro dele, por TIPO de peça, todas as
// peças de um modelo saem juntas.
//
// SÓ A ORDEM MUDA. A soma por produto/tamanho/cor é a mesma de antes, a
// descrição impressa é a mesma string, e o total do rodapé tem que bater
// exatamente com o de antes — este módulo não pode fazer linha sumir nem
// aparecer.
//
// POR QUE ALFABÉTICA nos dois níveis:
//
//  - entre MODELOS, porque previsível vence "ordem em que foi digitado": o
//    ACONCHEGO cai sempre no mesmo lugar da folha, independente de o pedido
//    ter começado por ele ou não.
//  - entre TIPOS, porque a alfabética por acaso já entrega a ordem pedida —
//    Capa de Almofada -> Capa de Almofada Baguete -> Manta -> Peseira. É
//    COINCIDÊNCIA FAVORÁVEL do nome, não uma ordem escolhida: se um tipo novo
//    entrar e cair no lugar errado, a saída não é remendar a comparação aqui,
//    é dar um campo `ordem` a `modelos`/tipos como `tamanhos` já tem — que é
//    exatamente pra isso que ele existe lá.
//
// Dentro do grupo a ordem é tamanho e depois cor. O tamanho vem da `ordem` do
// catálogo (Casal, Queen, King, Manta, 45x45…), nunca do alfabeto: "45x45"
// antes de "Casal" não diz nada a ninguém.

/** Produto do catálogo, o mínimo que este módulo precisa saber dele. */
export type ProdutoDoCatalogo = { id: string; nome: string }

export type CatalogoSeparacao = {
  /** `produtoId` -> nome do produto. Resolve o item avulso moderno. */
  nomePorId: Record<string, string>
  /**
   * Nomes conhecidos, pro fallback por texto dos itens antigos. Do mais
   * LONGO pro mais curto, mesma regra de `CatalogoPesos.nomesProduto` em
   * src/lib/peso.ts: "Capa de Almofada Baguete - ARAN" tem que ganhar de
   * "Capa de Almofada - ARAN".
   */
  nomesProduto: string[]
  /** nome do tamanho em minúscula -> `ordem` do catálogo de tamanhos. */
  ordemTamanho: Record<string, number>
}

export function catalogoSeparacaoVazio(): CatalogoSeparacao {
  return { nomePorId: {}, nomesProduto: [], ordemTamanho: {} }
}

export function montarCatalogoSeparacao(
  produtos: ProdutoDoCatalogo[],
  tamanhos: { nome: string; ordem: number }[],
): CatalogoSeparacao {
  const cat = catalogoSeparacaoVazio()
  for (const p of produtos) cat.nomePorId[p.id] = p.nome
  for (const t of tamanhos) cat.ordemTamanho[t.nome.trim().toLowerCase()] = t.ordem
  cat.nomesProduto = [...new Set(produtos.map((p) => p.nome.trim()))].sort(
    (a, b) => b.length - a.length,
  )
  return cat
}

/** O mínimo que uma linha de pedido precisa ter pra virar linha de separação. */
export type ItemSeparavel = {
  descricao: string
  quantidade: number
  tamanho: string | null
  produtoId?: string | null
  kitComponentes:
    | {
        produtoNome: string
        cor: string | null
        quantidade: number
        tamanho?: string | null
      }[]
    | null
}

export type LinhaSeparacao = { descricao: string; quantidade: number }

// Linha de pedido que É um kit mas não tem os componentes gravados — só o
// texto. Não pode cair no fallback por nome: a descrição de um kit CITA os
// componentes ("Kit Manta + 2 Capas de Almofada - SIENA - …"), então casaria
// com "Capa de Almofada - SIENA" e o kit inteiro iria parar dentro do grupo
// de um componente dele. Vai pra "outros", onde não mente sobre o que é.
// Mesmo guarda e mesmo motivo do `PREFIXO_KIT` em src/lib/peso.ts — repetido
// aqui em vez de importado porque os dois módulos não dependem um do outro.
const PREFIXO_KIT = /^\s*kit\b/i

/**
 * Tipo e modelo saem do NOME DO PRODUTO, quebrado no PRIMEIRO " - ":
 * "Capa de Almofada - ACONCHEGO" -> tipo "Capa de Almofada", modelo
 * "ACONCHEGO".
 *
 * ⚠️ Nunca faça esta quebra na descrição montada. Ela tem DOIS " - " e o
 * segundo é a cor: "Capa de Almofada - ACONCHEGO 45x45 - Âmbar Dourado"
 * daria modelo "ACONCHEGO 45X45" e perderia o agrupamento.
 */
function classificar(
  produtoNome: string,
): { tipo: string; modelo: string } | null {
  const i = produtoNome.indexOf(' - ')
  if (i < 0) return null
  const tipo = produtoNome.slice(0, i).trim()
  const modelo = produtoNome.slice(i + 3).trim()
  if (!tipo || !modelo) return null
  return { tipo, modelo }
}

/**
 * Nome do produto de uma peça, na ordem: snapshot do componente, catálogo
 * pelo `produto_id`, e por fim o texto da descrição. `null` = não deu, e a
 * linha vai pra "outros".
 */
function nomeDoProduto(
  catalogo: CatalogoSeparacao,
  peca: {
    produtoNome?: string | null
    produtoId?: string | null
    descricao?: string | null
  },
): string | null {
  // 1. Componente de kit: o snapshot já guarda o nome do produto.
  if (peca.produtoNome) return peca.produtoNome

  // 2. Item avulso moderno: o vínculo com o catálogo.
  if (peca.produtoId) {
    const nome = catalogo.nomePorId[peca.produtoId]
    if (nome) return nome
  }

  // 3. Item avulso ANTIGO (380 linhas, sem `produto_id`): casa um nome
  //    conhecido dentro da descrição, do mais LONGO pro mais curto. Mesma
  //    regra do fallback por texto de src/lib/peso.ts.
  if (!peca.descricao || PREFIXO_KIT.test(peca.descricao)) return null
  const alvo = peca.descricao.toLowerCase()
  return catalogo.nomesProduto.find((n) => alvo.includes(n.toLowerCase())) ?? null
}

type LinhaInterna = {
  descricao: string
  quantidade: number
  // null nos dois = não classificou; vai pro fim, em ordem de aparição.
  modelo: string | null
  tipo: string | null
  ordemTamanho: number
  cor: string
  aparicao: number
}

const emPortugues = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

export function montarLinhasSeparacao(
  itens: ItemSeparavel[],
  catalogo: CatalogoSeparacao,
): LinhaSeparacao[] {
  const porDescricao = new Map<string, LinhaInterna>()

  // A classificação fica com a PRIMEIRA ocorrência da descrição. Duas peças
  // com a mesma descrição são o mesmo produto/tamanho/cor por construção —
  // é justamente por isso que elas somam.
  function somar(
    descricao: string,
    quantidade: number,
    dados: Omit<LinhaInterna, 'descricao' | 'quantidade' | 'aparicao'>,
  ) {
    const existente = porDescricao.get(descricao)
    if (existente) {
      existente.quantidade += quantidade
      return
    }
    porDescricao.set(descricao, {
      descricao,
      quantidade,
      aparicao: porDescricao.size,
      ...dados,
    })
  }

  function classificacao(
    produtoNome: string | null,
    tamanho: string | null | undefined,
    cor: string | null | undefined,
  ) {
    const c = produtoNome ? classificar(produtoNome) : null
    const tam = tamanho?.trim().toLowerCase() ?? ''
    return {
      modelo: c?.modelo ?? null,
      tipo: c?.tipo ?? null,
      // Tamanho desconhecido vai pro fim do grupo: o que tem posição no
      // catálogo forma a sequência principal.
      ordemTamanho: catalogo.ordemTamanho[tam] ?? Number.MAX_SAFE_INTEGER,
      cor: cor?.trim() ?? '',
    }
  }

  for (const it of itens) {
    const componentes = it.kitComponentes
    if (componentes && componentes.length > 0) {
      for (const c of componentes) {
        // Tamanho do COMPONENTE (a capa é 45x45 mesmo num kit Queen). Cai pro
        // tamanho do item quando o snapshot é antigo e não tem tamanho.
        const tam = c.tamanho ?? it.tamanho
        const descricao = [`${c.produtoNome}${tam ? ` ${tam}` : ''}`, c.cor]
          .filter(Boolean)
          .join(' - ')
        somar(
          descricao,
          c.quantidade * it.quantidade,
          classificacao(
            nomeDoProduto(catalogo, { produtoNome: c.produtoNome }),
            tam,
            c.cor,
          ),
        )
      }
      continue
    }

    // Produto avulso entra na MESMA lista e soma com componente de kit do
    // mesmo produto/tamanho/cor: quem separa não quer saber de onde veio.
    somar(
      it.descricao,
      it.quantidade,
      classificacao(
        nomeDoProduto(catalogo, {
          produtoId: it.produtoId,
          descricao: it.descricao,
        }),
        it.tamanho,
        // A cor do avulso vive dentro do texto e não dá pra separar dele com
        // segurança; a própria descrição desempata, e ela termina na cor.
        null,
      ),
    )
  }

  const linhas = [...porDescricao.values()]
  linhas.sort((a, b) => {
    // "outros" no FIM, entre si na ordem de aparição de hoje: linha que não
    // dá pra classificar não pode sumir nem se embaralhar.
    const aClassificada = a.modelo != null
    const bClassificada = b.modelo != null
    if (aClassificada !== bClassificada) return aClassificada ? -1 : 1
    if (!aClassificada) return a.aparicao - b.aparicao

    const porModelo = emPortugues(a.modelo!, b.modelo!)
    if (porModelo !== 0) return porModelo
    const porTipo = emPortugues(a.tipo!, b.tipo!)
    if (porTipo !== 0) return porTipo
    if (a.ordemTamanho !== b.ordemTamanho) return a.ordemTamanho - b.ordemTamanho
    const porCor = emPortugues(a.cor, b.cor)
    if (porCor !== 0) return porCor
    return emPortugues(a.descricao, b.descricao)
  })

  return linhas.map((l) => ({ descricao: l.descricao, quantidade: l.quantidade }))
}
