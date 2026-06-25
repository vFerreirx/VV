'use server'

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAuth, requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  eventosKanban,
  kitItens,
  kits,
  ordensProducao,
  produtos,
  variacoesProduto,
  type Kit,
} from '@/lib/db/schema'
import {
  gerarOpsKitSchema,
  kitSchema,
  type GerarOpsKitInput,
  type KitInput,
} from '@/lib/validators/kits'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Tipos de leitura
// -----------------------------------------------------------------

export type KitListItem = Kit & {
  itensCount: number
  pecasPorKit: number
}

export type KitItemDetalhe = {
  id: string
  variacaoId: string
  quantidade: number
  skuVariacao: string
  produtoNome: string
  cor: string | null
  tamanho: string | null
  modelo: string | null
}

export type KitComItens = Kit & { itens: KitItemDetalhe[] }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarKits(): Promise<KitListItem[]> {
  await requireAuth()
  const rows = await db
    .select()
    .from(kits)
    .where(isNull(kits.deletedAt))
    .orderBy(asc(kits.nome))
  if (rows.length === 0) return []

  const ids = rows.map((k) => k.id)
  const agg = await db
    .select({
      kitId: kitItens.kitId,
      itens: sql<number>`count(*)::int`,
      pecas: sql<number>`coalesce(sum(${kitItens.quantidade}), 0)::int`,
    })
    .from(kitItens)
    .where(inArray(kitItens.kitId, ids))
    .groupBy(kitItens.kitId)
  const m = new Map(agg.map((a) => [a.kitId, a]))

  return rows.map((k) => ({
    ...k,
    itensCount: m.get(k.id)?.itens ?? 0,
    pecasPorKit: m.get(k.id)?.pecas ?? 0,
  }))
}

// Todos os kits ativos já com os itens resolvidos (lista + edição).
export async function listarKitsComItens(): Promise<KitComItens[]> {
  await requireAuth()
  const rows = await db
    .select()
    .from(kits)
    .where(isNull(kits.deletedAt))
    .orderBy(asc(kits.nome))
  if (rows.length === 0) return []

  const ids = rows.map((k) => k.id)
  const itens = await db
    .select({
      kitId: kitItens.kitId,
      id: kitItens.id,
      variacaoId: kitItens.variacaoId,
      quantidade: kitItens.quantidade,
      skuVariacao: variacoesProduto.skuVariacao,
      cor: variacoesProduto.cor,
      tamanho: variacoesProduto.tamanho,
      modelo: variacoesProduto.modelo,
      produtoNome: produtos.nome,
    })
    .from(kitItens)
    .innerJoin(variacoesProduto, eq(variacoesProduto.id, kitItens.variacaoId))
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(inArray(kitItens.kitId, ids))
    .orderBy(asc(produtos.nome))

  const porKit = new Map<string, KitItemDetalhe[]>()
  for (const it of itens) {
    const { kitId, ...resto } = it
    const arr = porKit.get(kitId)
    if (arr) arr.push(resto)
    else porKit.set(kitId, [resto])
  }

  return rows.map((k) => ({ ...k, itens: porKit.get(k.id) ?? [] }))
}

export async function obterKit(id: string): Promise<KitComItens | null> {
  await requireAuth()
  const [k] = await db
    .select()
    .from(kits)
    .where(and(eq(kits.id, id), isNull(kits.deletedAt)))
    .limit(1)
  if (!k) return null

  const itens = await db
    .select({
      id: kitItens.id,
      variacaoId: kitItens.variacaoId,
      quantidade: kitItens.quantidade,
      skuVariacao: variacoesProduto.skuVariacao,
      cor: variacoesProduto.cor,
      tamanho: variacoesProduto.tamanho,
      modelo: variacoesProduto.modelo,
      produtoNome: produtos.nome,
    })
    .from(kitItens)
    .innerJoin(
      variacoesProduto,
      eq(variacoesProduto.id, kitItens.variacaoId),
    )
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(eq(kitItens.kitId, id))
    .orderBy(asc(produtos.nome))

  return { ...k, itens }
}

// -----------------------------------------------------------------
// Criar / atualizar / excluir
// -----------------------------------------------------------------

async function skuEmUso(sku: string, exceto?: string): Promise<boolean> {
  const linhas = await db
    .select({ id: kits.id })
    .from(kits)
    .where(and(eq(kits.sku, sku), isNull(kits.deletedAt)))
    .limit(1)
  return linhas.length > 0 && linhas[0]!.id !== exceto
}

export async function criarKitAction(
  input: KitInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole(['admin', 'gerente_producao'])
  const parsed = kitSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  if (await skuEmUso(data.sku)) {
    return { success: false, error: `Já existe um kit com o SKU "${data.sku}"` }
  }

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(kits)
      .values({
        sku: data.sku,
        nome: data.nome,
        descricao: data.descricao ?? null,
        ativo: data.ativo,
      })
      .returning({ id: kits.id })

    await tx.insert(kitItens).values(
      data.itens.map((it) => ({
        kitId: inserted!.id,
        variacaoId: it.variacaoId,
        quantidade: it.quantidade,
      })),
    )
    return inserted!.id
  })

  revalidatePath('/kits')
  return { success: true, data: { id: novoId }, message: 'Kit criado' }
}

export async function atualizarKitAction(
  id: string,
  input: KitInput,
): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])
  const parsed = kitSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: kits.id })
    .from(kits)
    .where(and(eq(kits.id, id), isNull(kits.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Kit não encontrado' }

  if (await skuEmUso(data.sku, id)) {
    return { success: false, error: `Já existe outro kit com o SKU "${data.sku}"` }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(kits)
      .set({
        sku: data.sku,
        nome: data.nome,
        descricao: data.descricao ?? null,
        ativo: data.ativo,
      })
      .where(eq(kits.id, id))

    // Substitui os itens (simples e seguro).
    await tx.delete(kitItens).where(eq(kitItens.kitId, id))
    await tx.insert(kitItens).values(
      data.itens.map((it) => ({
        kitId: id,
        variacaoId: it.variacaoId,
        quantidade: it.quantidade,
      })),
    )
  })

  revalidatePath('/kits')
  return { success: true, message: 'Kit atualizado' }
}

export async function excluirKitAction(id: string): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao'])
  const [atual] = await db
    .select({ id: kits.id })
    .from(kits)
    .where(and(eq(kits.id, id), isNull(kits.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Kit não encontrado' }

  await db
    .update(kits)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(kits.id, id))

  revalidatePath('/kits')
  return { success: true, message: 'Kit excluído' }
}

// -----------------------------------------------------------------
// Gerar OPs dos componentes (explode o kit em itens unitários)
// -----------------------------------------------------------------

export async function gerarOpsKitAction(
  input: GerarOpsKitInput,
): Promise<ActionResult<{ ops: number; pecas: number }>> {
  const user = await requireRole(['admin', 'gerente_producao'])
  const parsed = gerarOpsKitSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const { kitId, quantidade, canalDestino, prioridade } = parsed.data

  const [kit] = await db
    .select({ id: kits.id, nome: kits.nome })
    .from(kits)
    .where(and(eq(kits.id, kitId), isNull(kits.deletedAt)))
    .limit(1)
  if (!kit) return { success: false, error: 'Kit não encontrado' }

  // Itens do kit + produtoId de cada variação (necessário pra OP).
  const itens = await db
    .select({
      variacaoId: kitItens.variacaoId,
      quantidade: kitItens.quantidade,
      produtoId: variacoesProduto.produtoId,
    })
    .from(kitItens)
    .innerJoin(
      variacoesProduto,
      eq(variacoesProduto.id, kitItens.variacaoId),
    )
    .where(eq(kitItens.kitId, kitId))

  if (itens.length === 0) {
    return { success: false, error: 'O kit não tem itens pra produzir' }
  }

  let pecas = 0
  await db.transaction(async (tx) => {
    for (const it of itens) {
      const qtd = it.quantidade * quantidade
      pecas += qtd
      const [op] = await tx
        .insert(ordensProducao)
        .values({
          numero: '',
          produtoId: it.produtoId,
          variacaoId: it.variacaoId,
          quantidade: qtd,
          canalDestino,
          prioridade,
          status: 'programado',
          criadoPor: user.id,
          observacoes: `Gerada do kit ${kit.nome} (${quantidade} kit${quantidade > 1 ? 's' : ''})`,
        })
        .returning({ id: ordensProducao.id })

      await tx.insert(eventosKanban).values({
        ordemId: op!.id,
        statusAnterior: null,
        statusNovo: 'programado',
        usuarioId: user.id,
        observacao: `OP gerada do kit ${kit.nome}`,
      })
    }
  })

  revalidatePath('/producao')
  revalidatePath('/ordens')
  return {
    success: true,
    data: { ops: itens.length, pecas },
    message: `${itens.length} OP${itens.length > 1 ? 's' : ''} gerada${itens.length > 1 ? 's' : ''} (${pecas} peças)`,
  }
}
