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

export type LinhaSeparacao = {
  /** Identidade estável da linha — ver "A CHAVE DA LINHA" abaixo. */
  chave: string
  descricao: string
  quantidade: number
}

// ─────────────────────────────────────────────────────────────────────────
// A CHAVE DA LINHA
// ─────────────────────────────────────────────────────────────────────────
// A marcação de FALTANTE (quantas peças desta linha não foram achadas) é
// gravada no banco, e precisa reencontrar a linha depois. Guardar a DESCRIÇÃO
// como chave seria frágil: ela é texto de exibição, muda de formato quando o
// documento muda, e aí a marcação some sem ninguém perceber — o pior tipo de
// bug, porque a tela continua abrindo e só o número está errado.
//
// A chave é o TRIO que DEFINE a peça — produto, tamanho e cor — normalizado
// (sem espaço sobrando, sem diferença de caixa). Ele sobrevive a mudança de
// formato do texto: trocar " - " por " · " na descrição não mexe na chave.
//
// QUANDO O TRIO VALE: só quando a descrição pode ser RECONSTRUÍDA a partir
// dele. Isso é verdade por construção no componente de kit (a descrição é
// montada dos três) e verificável no item avulso (o produto vem do
// `produto_id` e o tamanho da coluna; a cor é o que sobra do texto). Quando a
// reconstrução não bate — item antigo sem `produto_id`, descrição escrita à
// mão — não existe trio confiável, e a chave cai na descrição normalizada com
// o prefixo `?|`. Nesse caso ela é tão frágil quanto o texto, mas é o melhor
// que existe pra aquela linha, e o prefixo deixa isso VISÍVEL no banco em vez
// de fingir estrutura que não há.
//
// UNICIDADE dentro do pedido: duas linhas são duas descrições diferentes (é a
// descrição que agrupa). Se as duas têm trio confiável, descrições diferentes
// ⇒ trios diferentes, porque a descrição é função do trio. Se as duas caem no
// fallback, as chaves são as descrições. E uma de cada nunca colide, porque só
// o fallback usa o prefixo `?|`.

const normalizar = (s: string | null | undefined): string =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** A descrição impressa de uma peça — a MESMA montagem nos dois caminhos. */
function descricaoDaPeca(
  produto: string,
  tamanho: string | null | undefined,
  cor: string | null | undefined,
): string {
  const base = `${produto}${tamanho ? ` ${tamanho}` : ''}`
  return cor ? `${base} - ${cor}` : base
}

/** Chave do trio confiável. */
export function chaveDaPeca(t: {
  produto: string
  tamanho: string | null | undefined
  cor: string | null | undefined
}): string {
  return `${normalizar(t.produto)}|${normalizar(t.tamanho)}|${normalizar(t.cor)}`
}

/** Chave de quem não tem trio: a própria descrição, e o `?|` avisa. */
export function chaveDeTextoLivre(descricao: string): string {
  return `?|${normalizar(descricao)}`
}

/**
 * A cor de um item AVULSO, por subtração: a descrição é
 * "<produto> <tamanho> - <cor>", então tirando o começo conhecido sobra a
 * cor. `''` quando o item não tem cor e `null` quando o começo não bate — aí
 * não dá pra afirmar nada sobre aquele texto.
 */
function corDoAvulso(
  descricao: string,
  produto: string | null,
  tamanho: string | null | undefined,
): string | null {
  if (!produto) return null
  const base = `${produto}${tamanho ? ` ${tamanho}` : ''}`
  if (descricao === base) return ''
  if (descricao.startsWith(`${base} - `)) return descricao.slice(base.length + 3)
  return null
}

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
  chave: string
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

  /**
   * A chave da linha. Só aceita o trio quando ele RECONSTRÓI a descrição —
   * sem isso a chave apontaria pra uma peça que não é a desta linha.
   */
  function chaveDaLinha(
    descricao: string,
    produto: string | null,
    tamanho: string | null | undefined,
    cor: string | null | undefined,
  ): string {
    if (produto && descricaoDaPeca(produto, tamanho, cor) === descricao) {
      return chaveDaPeca({ produto, tamanho, cor })
    }
    return chaveDeTextoLivre(descricao)
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
        // Aqui o trio SEMPRE reconstrói a descrição: ela é montada dele.
        const descricao = descricaoDaPeca(c.produtoNome, tam, c.cor)
        somar(descricao, c.quantidade * it.quantidade, {
          chave: chaveDaLinha(descricao, c.produtoNome, tam, c.cor),
          ...classificacao(
            nomeDoProduto(catalogo, { produtoNome: c.produtoNome }),
            tam,
            c.cor,
          ),
        })
      }
      continue
    }

    // Produto avulso entra na MESMA lista e soma com componente de kit do
    // mesmo produto/tamanho/cor: quem separa não quer saber de onde veio.
    const produto = nomeDoProduto(catalogo, {
      produtoId: it.produtoId,
      descricao: it.descricao,
    })
    somar(it.descricao, it.quantidade, {
      // A cor do avulso não tem coluna: ela vive no fim da descrição. Dá pra
      // recuperá-la por SUBTRAÇÃO — tira o "<produto> <tamanho> - " do começo
      // e o que sobra é a cor. Quando a subtração não bate (item antigo sem
      // `produto_id`, texto escrito à mão), `chaveDaLinha` percebe sozinho e
      // cai no fallback: é ele quem confere a reconstrução, não este cálculo.
      chave: chaveDaLinha(
        it.descricao,
        produto,
        it.tamanho,
        corDoAvulso(it.descricao, produto, it.tamanho),
      ),
      ...classificacao(
        produto,
        it.tamanho,
        // Pra ORDENAR, a cor continua saindo da própria descrição, que
        // termina nela — este campo é desempate de ordenação, não identidade.
        null,
      ),
    })
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

  return linhas.map((l) => ({
    chave: l.chave,
    descricao: l.descricao,
    quantidade: l.quantidade,
  }))
}
