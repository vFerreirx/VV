'use server'

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { tamanhosPesoPorProduto } from '@/lib/db/pesos'
import {
  produtos,
  produtoTamanhoPreco,
  tamanhos,
  variacoesProduto,
  type Produto,
  type VariacaoProduto,
} from '@/lib/db/schema'
import type { TamanhoDoProduto } from '@/lib/peso'
import {
  produtoSchema,
  produtosFiltrosSchema,
  type ProdutoInput,
  type ProdutosFiltros,
} from '@/lib/validators/produtos'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem com filtros
// -----------------------------------------------------------------

export type ProdutoListItem = Produto & {
  totalVariacoes: number
  // Tamanhos distintos das variações, com o peso cadastrado em cada um. É a
  // origem do peso quando o produto não tem override — ver `pesoDeProduto`
  // em src/lib/peso.ts.
  tamanhosPeso: TamanhoDoProduto[]
}

export async function listarProdutos(
  filtros: ProdutosFiltros = {},
): Promise<ProdutoListItem[]> {
  await requireAuth()
  const parsed = produtosFiltrosSchema.safeParse(filtros)
  const { q, ativo } = parsed.success ? parsed.data : {}

  const conditions = [isNull(produtos.deletedAt)]
  if (q && q.length > 0) {
    conditions.push(
      or(
        ilike(produtos.sku, `%${q}%`),
        ilike(produtos.nome, `%${q}%`),
      )!,
    )
  }
  if (ativo === 'true') conditions.push(eq(produtos.ativo, true))
  else if (ativo === 'false') conditions.push(eq(produtos.ativo, false))

  // Conta variações via subquery agregada — evita N+1. Só as ativas.
  // Qualifica "produtos"."id" explicitamente: interpolar ${produtos.id} teria
  // gerado só o identificador sem qualificar, e como variacoes_produto
  // também tem uma coluna `id`, o Postgres resolveria pro escopo mais
  // interno (a subquery) em vez de correlacionar com a tabela externa.
  const totalVariacoesSql = sql<number>`(
    SELECT COUNT(*)::int
    FROM ${variacoesProduto}
    WHERE ${variacoesProduto.produtoId} = "produtos"."id"
      AND ${variacoesProduto.deletedAt} IS NULL
  )`.as('total_variacoes')

  const rows = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      nome: produtos.nome,
      descricao: produtos.descricao,
      pesoGramas: produtos.pesoGramas,
      mlbId: produtos.mlbId,
      shopeeItemId: produtos.shopeeItemId,
      ativo: produtos.ativo,
      createdAt: produtos.createdAt,
      updatedAt: produtos.updatedAt,
      deletedAt: produtos.deletedAt,
      totalVariacoes: totalVariacoesSql,
    })
    .from(produtos)
    .where(and(...conditions))
    .orderBy(desc(produtos.ativo), asc(produtos.sku))

  const porProduto = await tamanhosPesoPorProduto(rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, tamanhosPeso: porProduto.get(r.id) ?? [] }))
}

// -----------------------------------------------------------------
// Buscar por id (com variações)
// -----------------------------------------------------------------

export type ProdutoComVariacoes = Produto & {
  variacoes: VariacaoProduto[]
  // Preço de tabela por NOME do tamanho ("Casal" → "50.00"). Por nome e não
  // por id porque é assim que o produto conhece os tamanhos dele: a variação
  // guarda texto (`variacoes_produto.tamanho`), não FK.
  precos: Record<string, string>
}

export async function obterProduto(
  id: string,
): Promise<ProdutoComVariacoes | null> {
  await requireAuth()
  const [produto] = await db
    .select()
    .from(produtos)
    .where(and(eq(produtos.id, id), isNull(produtos.deletedAt)))
    .limit(1)

  if (!produto) return null

  const [variacoes, linhasPreco] = await Promise.all([
    db
      .select()
      .from(variacoesProduto)
      .where(
        and(
          eq(variacoesProduto.produtoId, id),
          isNull(variacoesProduto.deletedAt),
        ),
      )
      .orderBy(asc(variacoesProduto.skuVariacao)),
    db
      .select({ tamanho: tamanhos.nome, preco: produtoTamanhoPreco.preco })
      .from(produtoTamanhoPreco)
      .innerJoin(tamanhos, eq(tamanhos.id, produtoTamanhoPreco.tamanhoId))
      .where(eq(produtoTamanhoPreco.produtoId, id)),
  ])

  const precos: Record<string, string> = {}
  for (const l of linhasPreco) precos[l.tamanho] = l.preco

  return { ...produto, variacoes, precos }
}

// -----------------------------------------------------------------
// Preço de tabela (produto × tamanho)
// -----------------------------------------------------------------

// Grava o que a tela mandou, resolvendo o tamanho por NOME.
//
// Só mexe nos tamanhos QUE VIERAM no input. Tamanho que o produto deixou de
// oferecer (variação removida) não é mencionado e fica intacto: apagar preço
// como efeito colateral de mexer numa variação seria perda de dado calada, e
// a linha órfã não faz mal — o builder não consegue montar um par que o
// produto não oferece.
//
// Preço vazio, esse sim, apaga: é o usuário dizendo "este tamanho não tem
// preço de tabela".
async function salvarPrecosDoProduto(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  produtoId: string,
  entradas: { tamanho: string; preco: number | null }[],
) {
  if (entradas.length === 0) return

  const nomes = [...new Set(entradas.map((e) => e.tamanho.trim().toLowerCase()))]
  const conhecidos = await tx
    .select({ id: tamanhos.id, nome: tamanhos.nome })
    .from(tamanhos)
    .where(isNull(tamanhos.deletedAt))
  const porNome = new Map(
    conhecidos
      .filter((t) => nomes.includes(t.nome.trim().toLowerCase()))
      .map((t) => [t.nome.trim().toLowerCase(), t.id]),
  )

  for (const e of entradas) {
    // Tamanho digitado à mão na variação que não existe no cadastro de
    // tamanhos: não há onde pendurar o preço. Ignora em silêncio — a tela
    // nem oferece campo pra ele.
    const tamanhoId = porNome.get(e.tamanho.trim().toLowerCase())
    if (!tamanhoId) continue

    if (e.preco == null) {
      await tx
        .delete(produtoTamanhoPreco)
        .where(
          and(
            eq(produtoTamanhoPreco.produtoId, produtoId),
            eq(produtoTamanhoPreco.tamanhoId, tamanhoId),
          ),
        )
      continue
    }

    await tx
      .insert(produtoTamanhoPreco)
      .values({ produtoId, tamanhoId, preco: e.preco.toFixed(2) })
      .onConflictDoUpdate({
        target: [produtoTamanhoPreco.produtoId, produtoTamanhoPreco.tamanhoId],
        set: { preco: e.preco.toFixed(2), updatedAt: sql`now()` },
      })
  }
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarProdutoAction(
  input: ProdutoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('produtos')

  const parsed = produtoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // SKU único entre produtos ATIVOS (excluídos liberam o SKU).
  const existing = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.sku, data.sku), isNull(produtos.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe um produto com SKU "${data.sku}"` }
  }

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(produtos)
      .values({
        sku: data.sku,
        nome: data.nome,
        descricao: data.descricao ?? null,
        pesoGramas: data.pesoGramas ?? null,
        ativo: data.ativo,
      })
      .returning({ id: produtos.id })

    if (data.variacoes.length > 0) {
      await tx.insert(variacoesProduto).values(
        data.variacoes.map((v) => ({
          produtoId: inserted!.id,
          skuVariacao: v.skuVariacao,
          cor: v.cor ?? null,
          modelo: v.modelo ?? null,
          tamanho: v.tamanho ?? null,
        })),
      )
    }

    await salvarPrecosDoProduto(tx, inserted!.id, data.precos)

    return inserted!.id
  })

  revalidatePath('/produtos')
  return {
    success: true,
    data: { id: novoId },
    message: 'Produto criado',
  }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarProdutoAction(
  id: string,
  input: ProdutoInput,
): Promise<ActionResult> {
  await requireAreaEscrita('produtos')

  const parsed = produtoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // Garante que o produto existe e não está deletado.
  const [atual] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.id, id), isNull(produtos.deletedAt)))
    .limit(1)

  if (!atual) {
    return { success: false, error: 'Produto não encontrado' }
  }

  // SKU único entre OUTROS produtos.
  const conflicting = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.sku, data.sku), isNull(produtos.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return { success: false, error: `Já existe outro produto com SKU "${data.sku}"` }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(produtos)
      .set({
        sku: data.sku,
        nome: data.nome,
        descricao: data.descricao ?? null,
        pesoGramas: data.pesoGramas ?? null,
        ativo: data.ativo,
      })
      .where(eq(produtos.id, id))

    // Estratégia de variações: pega as existentes, compara com o input.
    // - id no input + presente: UPDATE
    // - id no input + ausente do input: DELETE
    // - sem id: INSERT
    const existentes = await tx
      .select({ id: variacoesProduto.id })
      .from(variacoesProduto)
      .where(eq(variacoesProduto.produtoId, id))
    const existIds = new Set(existentes.map((e) => e.id))
    const inputIds = new Set(
      data.variacoes.map((v) => v.id).filter((x): x is string => Boolean(x)),
    )

    // DELETE: existem no banco mas não no input
    const toDelete = [...existIds].filter((eid) => !inputIds.has(eid))
    for (const did of toDelete) {
      await tx.delete(variacoesProduto).where(eq(variacoesProduto.id, did))
    }

    // UPDATE / INSERT
    for (const v of data.variacoes) {
      if (v.id && existIds.has(v.id)) {
        await tx
          .update(variacoesProduto)
          .set({
            skuVariacao: v.skuVariacao,
            cor: v.cor ?? null,
            modelo: v.modelo ?? null,
            tamanho: v.tamanho ?? null,
          })
          .where(eq(variacoesProduto.id, v.id))
      } else {
        await tx.insert(variacoesProduto).values({
          produtoId: id,
          skuVariacao: v.skuVariacao,
          cor: v.cor ?? null,
          modelo: v.modelo ?? null,
          tamanho: v.tamanho ?? null,
        })
      }
    }

    await salvarPrecosDoProduto(tx, id, data.precos)
  })

  revalidatePath('/produtos')
  revalidatePath(`/produtos/${id}`)
  // O builder do pedido lê o catálogo de preços; sem isto a sugestão
  // continuaria vindo do valor antigo até a página de pedidos recarregar.
  revalidatePath('/pedidos')
  return { success: true, message: 'Produto atualizado' }
}

// -----------------------------------------------------------------
// Duplicar (copia produto + variações com SKUs novos)
// -----------------------------------------------------------------

// Gera um SKU único a partir de um base, registrando no conjunto usado.
function gerarSkuUnico(base: string, usados: Set<string>): string {
  let cand = base
  let n = 2
  while (usados.has(cand)) {
    cand = `${base}-${n}`
    n++
  }
  usados.add(cand)
  return cand
}

export async function duplicarProdutoAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('produtos')

  const [orig] = await db
    .select()
    .from(produtos)
    .where(and(eq(produtos.id, id), isNull(produtos.deletedAt)))
    .limit(1)
  if (!orig) {
    return { success: false, error: 'Produto não encontrado' }
  }

  const variacoes = await db
    .select()
    .from(variacoesProduto)
    .where(
      and(
        eq(variacoesProduto.produtoId, id),
        isNull(variacoesProduto.deletedAt),
      ),
    )
    .orderBy(asc(variacoesProduto.skuVariacao))

  // Conjuntos de SKUs ATIVOS já existentes pra garantir unicidade.
  const skusProduto = new Set(
    (
      await db
        .select({ sku: produtos.sku })
        .from(produtos)
        .where(isNull(produtos.deletedAt))
    ).map((r) => r.sku),
  )
  const skusVariacao = new Set(
    (
      await db
        .select({ sku: variacoesProduto.skuVariacao })
        .from(variacoesProduto)
        .where(isNull(variacoesProduto.deletedAt))
    ).map((r) => r.sku),
  )

  const novoSku = gerarSkuUnico(`${orig.sku}-COPIA`, skusProduto)

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(produtos)
      .values({
        sku: novoSku,
        nome: `${orig.nome} (cópia)`,
        descricao: orig.descricao,
        pesoGramas: orig.pesoGramas,
        ativo: orig.ativo,
      })
      .returning({ id: produtos.id })

    if (variacoes.length > 0) {
      await tx.insert(variacoesProduto).values(
        variacoes.map((v) => ({
          produtoId: inserted!.id,
          skuVariacao: gerarSkuUnico(`${v.skuVariacao}-COPIA`, skusVariacao),
          cor: v.cor,
          modelo: v.modelo,
          tamanho: v.tamanho,
        })),
      )
    }

    return inserted!.id
  })

  revalidatePath('/produtos')
  return {
    success: true,
    data: { id: novoId },
    message: `Produto duplicado (${variacoes.length} variaç${variacoes.length === 1 ? 'ão' : 'ões'})`,
  }
}

// -----------------------------------------------------------------
// Soft delete
// -----------------------------------------------------------------

export async function excluirProdutoAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('produtos')

  const [atual] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(and(eq(produtos.id, id), isNull(produtos.deletedAt)))
    .limit(1)

  if (!atual) {
    return { success: false, error: 'Produto não encontrado' }
  }

  // Soft-delete do produto + suas variações (libera os SKUs pra reuso).
  const agora = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(produtos)
      .set({ deletedAt: agora, ativo: false })
      .where(eq(produtos.id, id))
    await tx
      .update(variacoesProduto)
      .set({ deletedAt: agora })
      .where(
        and(
          eq(variacoesProduto.produtoId, id),
          isNull(variacoesProduto.deletedAt),
        ),
      )
  })

  revalidatePath('/produtos')
  return { success: true, message: 'Produto excluído' }
}

// -----------------------------------------------------------------
// Excluir múltiplos (bulk delete)
// -----------------------------------------------------------------

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function excluirMultiplosProdutosAction(
  ids: string[],
): Promise<ActionResult<{ excluidos: number }>> {
  await requireAreaEscrita('produtos')

  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'Selecione ao menos um produto' }
  }
  const idsValidos = ids.filter((id) => uuidRegex.test(id))
  if (idsValidos.length === 0) {
    return { success: false, error: 'Nenhum ID válido na seleção' }
  }

  const agora = new Date()
  const result = await db.transaction(async (tx) => {
    const r = await tx
      .update(produtos)
      .set({ deletedAt: agora, ativo: false })
      .where(and(inArray(produtos.id, idsValidos), isNull(produtos.deletedAt)))
      .returning({ id: produtos.id })
    const ids = r.map((x) => x.id)
    if (ids.length > 0) {
      await tx
        .update(variacoesProduto)
        .set({ deletedAt: agora })
        .where(
          and(
            inArray(variacoesProduto.produtoId, ids),
            isNull(variacoesProduto.deletedAt),
          ),
        )
    }
    return r
  })

  revalidatePath('/produtos')
  return {
    success: true,
    data: { excluidos: result.length },
    message:
      result.length === 1
        ? '1 produto excluído'
        : `${result.length} produtos excluídos`,
  }
}
