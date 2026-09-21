import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '.'
import {
  cores,
  coresFornecedorFio,
  modelos,
  orcamentoItens,
  orcamentos,
  produtoTamanhoPeso,
  produtoTamanhoPreco,
  produtoTamanhoPrecoMarketplace,
  produtos,
  tamanhos,
  variacoesProduto,
} from './schema'
import { plural, uso, type UsoDoCatalogo } from '@/lib/catalogo-em-uso'

// QUEM ESTÁ USANDO ESTA COR / MODELO / TAMANHO — a pergunta que a exclusão
// precisa fazer antes de apagar.
//
// ⚠️ O VÍNCULO É POR TEXTO, e é isso que torna a exclusão perigosa.
// `variacoes_produto` guarda cor, modelo e tamanho como TEXTO (não FK), então
// apagar a linha do cadastro não quebra nada na hora — quebra depois, em
// silêncio, em três lugares:
//
//   - PESO: `tamanhosPesoPorProduto` (src/lib/db/pesos.ts) só junta tamanho
//     NÃO apagado. Apagar "King" faz o peso padrão dele sumir da conta, e o
//     pedido passa a cotar frete com 0 g naquela peça.
//   - PREÇO: a tela do produto só oferece campo pros tamanhos do cadastro, e
//     `salvarPrecoMarketplaceAction` recusa tamanho apagado — o preço que já
//     existe fica gravado e sem jeito de editar.
//   - FILTRO: a variação continua no produto, mas some das listas que saem
//     do cadastro.
//
// Nada disso dá erro. Por isso a exclusão pergunta antes, e a saída oferecida
// é DESATIVAR: o cadastro já tem `ativo`, que tira do formulário sem sumir de
// quem já usa.

// -----------------------------------------------------------------
// Tamanho
// -----------------------------------------------------------------

/**
 * Uso de cada tamanho, por id. UMA consulta por fonte, não uma por id.
 *
 * O tamanho é o eixo mais entrelaçado do catálogo: entra por NOME nas
 * variações e nos itens de pedido, e por ID nas três tabelas de preço/peso.
 */
export async function usoDeTamanhos(
  ids: string[],
): Promise<Map<string, UsoDoCatalogo>> {
  const mapa = new Map<string, UsoDoCatalogo>()
  if (ids.length === 0) return mapa

  const alvos = await db
    .select({ id: tamanhos.id, nome: tamanhos.nome })
    .from(tamanhos)
    .where(inArray(tamanhos.id, ids))
  if (alvos.length === 0) return mapa

  const nomes = alvos.map((a) => a.nome.trim().toLowerCase())

  const [emVariacoes, emPrecos, emPesos, emMarketplace, emPedidos] =
    await Promise.all([
      db
        .select({
          nome: sql<string>`lower(trim(${variacoesProduto.tamanho}))`,
          variacoes: sql<number>`count(*)::int`,
          produtos: sql<number>`count(distinct ${variacoesProduto.produtoId})::int`,
        })
        .from(variacoesProduto)
        .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
        .where(
          and(
            isNull(variacoesProduto.deletedAt),
            isNull(produtos.deletedAt),
            inArray(sql`lower(trim(${variacoesProduto.tamanho}))`, nomes),
          ),
        )
        .groupBy(sql`lower(trim(${variacoesProduto.tamanho}))`),
      db
        .select({
          id: produtoTamanhoPreco.tamanhoId,
          n: sql<number>`count(*)::int`,
        })
        .from(produtoTamanhoPreco)
        .where(inArray(produtoTamanhoPreco.tamanhoId, ids))
        .groupBy(produtoTamanhoPreco.tamanhoId),
      db
        .select({
          id: produtoTamanhoPeso.tamanhoId,
          n: sql<number>`count(*)::int`,
        })
        .from(produtoTamanhoPeso)
        .where(inArray(produtoTamanhoPeso.tamanhoId, ids))
        .groupBy(produtoTamanhoPeso.tamanhoId),
      db
        .select({
          id: produtoTamanhoPrecoMarketplace.tamanhoId,
          n: sql<number>`count(*)::int`,
        })
        .from(produtoTamanhoPrecoMarketplace)
        .where(inArray(produtoTamanhoPrecoMarketplace.tamanhoId, ids))
        .groupBy(produtoTamanhoPrecoMarketplace.tamanhoId),
      db
        .select({
          nome: sql<string>`lower(trim(${orcamentoItens.tamanho}))`,
          n: sql<number>`count(distinct ${orcamentoItens.orcamentoId})::int`,
        })
        .from(orcamentoItens)
        .innerJoin(orcamentos, eq(orcamentos.id, orcamentoItens.orcamentoId))
        .where(
          and(
            isNull(orcamentos.deletedAt),
            inArray(sql`lower(trim(${orcamentoItens.tamanho}))`, nomes),
          ),
        )
        .groupBy(sql`lower(trim(${orcamentoItens.tamanho}))`),
    ])

  const porNome = <T extends { nome: string }>(linhas: T[]) =>
    new Map(linhas.map((l) => [l.nome, l]))
  const porId = <T extends { id: string }>(linhas: T[]) =>
    new Map(linhas.map((l) => [l.id, l]))

  const variacoesPorNome = porNome(emVariacoes)
  const pedidosPorNome = porNome(emPedidos)
  const precosPorId = porId(emPrecos)
  const pesosPorId = porId(emPesos)
  const anunciosPorId = porId(emMarketplace)

  for (const alvo of alvos) {
    const chave = alvo.nome.trim().toLowerCase()
    const partes: string[] = []

    const v = variacoesPorNome.get(chave)
    if (v && v.variacoes > 0) {
      partes.push(
        `${plural(v.variacoes, 'variação', 'variações')} de ` +
          `${plural(v.produtos, 'produto', 'produtos')}`,
      )
    }
    const preco = precosPorId.get(alvo.id)
    if (preco && preco.n > 0) {
      partes.push(plural(preco.n, 'preço de atacado', 'preços de atacado'))
    }
    const peso = pesosPorId.get(alvo.id)
    if (peso && peso.n > 0) {
      partes.push(plural(peso.n, 'peso cadastrado', 'pesos cadastrados'))
    }
    const anuncio = anunciosPorId.get(alvo.id)
    if (anuncio && anuncio.n > 0) {
      partes.push(plural(anuncio.n, 'preço de anúncio', 'preços de anúncio'))
    }
    const pedido = pedidosPorNome.get(chave)
    if (pedido && pedido.n > 0) {
      partes.push(plural(pedido.n, 'pedido', 'pedidos'))
    }

    mapa.set(alvo.id, uso(alvo.nome, partes))
  }

  return mapa
}

// -----------------------------------------------------------------
// Cor
// -----------------------------------------------------------------

/**
 * Uso de cada cor, por id.
 *
 * Além das variações, a cor é referenciada por ID no de-para do fio
 * (`cores_fornecedor_fio`): apagar a cor deixa a cor do fornecedor apontando
 * pra um cadastro que sumiu.
 */
export async function usoDeCores(
  ids: string[],
): Promise<Map<string, UsoDoCatalogo>> {
  const mapa = new Map<string, UsoDoCatalogo>()
  if (ids.length === 0) return mapa

  const alvos = await db
    .select({ id: cores.id, nome: cores.nome })
    .from(cores)
    .where(inArray(cores.id, ids))
  if (alvos.length === 0) return mapa

  const nomes = alvos.map((a) => a.nome.trim().toLowerCase())

  // Sem olhar os itens de pedido: `orcamento_itens` NÃO tem coluna de cor —
  // a cor vai dentro da descrição (e do snapshot do kit), como texto livre.
  // Procurar cor lá dentro acharia "Marsala" em "Peseira Marsala" e também em
  // qualquer observação que citasse a palavra.
  const [emVariacoes, emFio] = await Promise.all([
    db
      .select({
        nome: sql<string>`lower(trim(${variacoesProduto.cor}))`,
        variacoes: sql<number>`count(*)::int`,
        produtos: sql<number>`count(distinct ${variacoesProduto.produtoId})::int`,
      })
      .from(variacoesProduto)
      .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
      .where(
        and(
          isNull(variacoesProduto.deletedAt),
          isNull(produtos.deletedAt),
          inArray(sql`lower(trim(${variacoesProduto.cor}))`, nomes),
        ),
      )
      .groupBy(sql`lower(trim(${variacoesProduto.cor}))`),
    db
      .select({
        id: coresFornecedorFio.corId,
        n: sql<number>`count(*)::int`,
      })
      .from(coresFornecedorFio)
      .where(
        and(
          isNull(coresFornecedorFio.deletedAt),
          inArray(coresFornecedorFio.corId, ids),
        ),
      )
      .groupBy(coresFornecedorFio.corId),
  ])

  const variacoesPorNome = new Map(emVariacoes.map((l) => [l.nome, l]))
  const fioPorId = new Map(emFio.map((l) => [l.id, l]))

  for (const alvo of alvos) {
    const chave = alvo.nome.trim().toLowerCase()
    const partes: string[] = []

    const v = variacoesPorNome.get(chave)
    if (v && v.variacoes > 0) {
      partes.push(
        `${plural(v.variacoes, 'variação', 'variações')} de ` +
          `${plural(v.produtos, 'produto', 'produtos')}`,
      )
    }
    const fio = fioPorId.get(alvo.id)
    if (fio && fio.n > 0) {
      partes.push(
        plural(fio.n, 'cor de fornecedor de fio', 'cores de fornecedor de fio'),
      )
    }
    mapa.set(alvo.id, uso(alvo.nome, partes))
  }

  return mapa
}

// -----------------------------------------------------------------
// Modelo
// -----------------------------------------------------------------

/** Uso de cada modelo, por id. O modelo só entra por texto, nas variações. */
export async function usoDeModelos(
  ids: string[],
): Promise<Map<string, UsoDoCatalogo>> {
  const mapa = new Map<string, UsoDoCatalogo>()
  if (ids.length === 0) return mapa

  const alvos = await db
    .select({ id: modelos.id, nome: modelos.nome })
    .from(modelos)
    .where(inArray(modelos.id, ids))
  if (alvos.length === 0) return mapa

  const nomes = alvos.map((a) => a.nome.trim().toLowerCase())

  const emVariacoes = await db
    .select({
      nome: sql<string>`lower(trim(${variacoesProduto.modelo}))`,
      variacoes: sql<number>`count(*)::int`,
      produtos: sql<number>`count(distinct ${variacoesProduto.produtoId})::int`,
    })
    .from(variacoesProduto)
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(
      and(
        isNull(variacoesProduto.deletedAt),
        isNull(produtos.deletedAt),
        inArray(sql`lower(trim(${variacoesProduto.modelo}))`, nomes),
      ),
    )
    .groupBy(sql`lower(trim(${variacoesProduto.modelo}))`)

  const porNome = new Map(emVariacoes.map((l) => [l.nome, l]))

  for (const alvo of alvos) {
    const v = porNome.get(alvo.nome.trim().toLowerCase())
    const partes =
      v && v.variacoes > 0
        ? [
            `${plural(v.variacoes, 'variação', 'variações')} de ` +
              `${plural(v.produtos, 'produto', 'produtos')}`,
          ]
        : []
    mapa.set(alvo.id, uso(alvo.nome, partes))
  }

  return mapa
}
