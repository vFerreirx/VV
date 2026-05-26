'use server'

import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import {
  isManager as isManagerRole,
  requireAuth,
  requireRole,
} from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  eventosKanban,
  maquinas,
  ordensProducao,
  produtos,
  users,
  variacoesProduto,
  type Maquina,
  type OrdemProducao,
  type Produto,
  type User,
  type VariacaoProduto,
} from '@/lib/db/schema'
import {
  mudarStatusOrdemSchema,
  ordemSchema,
  ordensFiltrosSchema,
  type MudarStatusOrdemInput,
  type OrdemInput,
  type OrdensFiltros,
} from '@/lib/validators/ordens'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export type OrdemListItem = OrdemProducao & {
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoTamanho: string | null
  maquinaCodigo: string | null
  responsavelNome: string | null
  atrasada: boolean
}

export async function listarOrdens(
  filtros: OrdensFiltros = {},
): Promise<OrdemListItem[]> {
  await requireAuth()
  const parsed = ordensFiltrosSchema.safeParse(filtros)
  const f = parsed.success ? parsed.data : {}

  const conditions = [isNull(ordensProducao.deletedAt)]
  if (f.q && f.q.length > 0) {
    conditions.push(
      or(
        ilike(ordensProducao.numero, `%${f.q}%`),
        ilike(produtos.nome, `%${f.q}%`),
        ilike(produtos.sku, `%${f.q}%`),
      )!,
    )
  }
  if (f.status && f.status !== 'todos') {
    conditions.push(eq(ordensProducao.status, f.status))
  }
  if (f.canal && f.canal !== 'todos') {
    conditions.push(eq(ordensProducao.canalDestino, f.canal))
  }
  if (f.prioridade && f.prioridade !== 'todas') {
    conditions.push(eq(ordensProducao.prioridade, f.prioridade))
  }
  if (f.maquinaId && f.maquinaId.length > 0) {
    conditions.push(eq(ordensProducao.maquinaId, f.maquinaId))
  }

  const rows = await db
    .select({
      op: ordensProducao,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoTamanho: variacoesProduto.tamanho,
      maquinaCodigo: maquinas.codigo,
      responsavelNome: users.nome,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .where(and(...conditions))
    .orderBy(desc(ordensProducao.createdAt))

  const now = Date.now()
  return rows.map(
    ({
      op,
      produtoNome,
      produtoSku,
      variacaoCor,
      variacaoTamanho,
      maquinaCodigo,
      responsavelNome,
    }) => ({
      ...op,
      produtoNome,
      produtoSku,
      variacaoCor: variacaoCor ?? null,
      variacaoTamanho: variacaoTamanho ?? null,
      maquinaCodigo: maquinaCodigo ?? null,
      responsavelNome: responsavelNome ?? null,
      atrasada:
        op.dataPrevistaFim !== null &&
        op.status !== 'enviado' &&
        op.status !== 'cancelado' &&
        new Date(op.dataPrevistaFim).getTime() < now,
    }),
  )
}

export type OrdemDetalhe = OrdemProducao & {
  produto: Produto
  variacao: VariacaoProduto | null
  maquina: Maquina | null
  criador: Pick<User, 'id' | 'nome' | 'email'> | null
  responsavel: Pick<User, 'id' | 'nome' | 'email'> | null
}

export async function obterOrdem(id: string): Promise<OrdemDetalhe | null> {
  await requireAuth()
  const [row] = await db
    .select({
      op: ordensProducao,
      produto: produtos,
      variacao: variacoesProduto,
      maquina: maquinas,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)

  if (!row) return null

  // Busca criador e responsável separados (evita JOINs múltiplos no users).
  const [criador, responsavel] = await Promise.all([
    row.op.criadoPor
      ? db
          .select({ id: users.id, nome: users.nome, email: users.email })
          .from(users)
          .where(eq(users.id, row.op.criadoPor))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    row.op.responsavelId
      ? db
          .select({ id: users.id, nome: users.nome, email: users.email })
          .from(users)
          .where(eq(users.id, row.op.responsavelId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ])

  return {
    ...row.op,
    produto: row.produto,
    variacao: row.variacao ?? null,
    maquina: row.maquina ?? null,
    criador,
    responsavel,
  }
}

// -----------------------------------------------------------------
// Listas pra preencher selects do form
// -----------------------------------------------------------------

export type ProdutoComVariacoesParaForm = Pick<
  Produto,
  'id' | 'sku' | 'nome'
> & {
  variacoes: Array<
    Pick<VariacaoProduto, 'id' | 'skuVariacao' | 'cor' | 'modelo' | 'tamanho'>
  >
}

export async function listarProdutosParaOrdem(): Promise<
  ProdutoComVariacoesParaForm[]
> {
  await requireAuth()

  const prods = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      nome: produtos.nome,
    })
    .from(produtos)
    .where(and(isNull(produtos.deletedAt), eq(produtos.ativo, true)))
    .orderBy(asc(produtos.sku))

  if (prods.length === 0) return []

  const vars = await db
    .select({
      id: variacoesProduto.id,
      produtoId: variacoesProduto.produtoId,
      skuVariacao: variacoesProduto.skuVariacao,
      cor: variacoesProduto.cor,
      modelo: variacoesProduto.modelo,
      tamanho: variacoesProduto.tamanho,
    })
    .from(variacoesProduto)
    .orderBy(asc(variacoesProduto.skuVariacao))

  const byProduto = new Map<string, typeof vars>()
  for (const v of vars) {
    const arr = byProduto.get(v.produtoId)
    if (arr) arr.push(v)
    else byProduto.set(v.produtoId, [v])
  }

  return prods.map((p) => ({
    ...p,
    variacoes: (byProduto.get(p.id) ?? []).map((v) => ({
      id: v.id,
      skuVariacao: v.skuVariacao,
      cor: v.cor,
      modelo: v.modelo,
      tamanho: v.tamanho,
    })),
  }))
}

export async function listarMaquinasParaOrdem(): Promise<
  Array<Pick<Maquina, 'id' | 'codigo' | 'nome' | 'status'>>
> {
  await requireAuth()
  return db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      status: maquinas.status,
    })
    .from(maquinas)
    .where(and(isNull(maquinas.deletedAt), sql`${maquinas.status} <> 'desativada'`))
    .orderBy(asc(maquinas.codigo))
}

export async function listarResponsaveis(): Promise<
  Array<Pick<User, 'id' | 'nome' | 'email' | 'role'>>
> {
  await requireAuth()
  return db
    .select({
      id: users.id,
      nome: users.nome,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.ativo, true),
        isNull(users.deletedAt),
        // Apenas roles que fazem sentido como responsável da OP.
        sql`${users.role} IN ('admin', 'gerente_producao', 'operador')`,
      ),
    )
    .orderBy(asc(users.nome))
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarOrdemAction(
  input: OrdemInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(['admin', 'gerente_producao'])

  const parsed = ordemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(ordensProducao)
      .values({
        // Trigger BEFORE INSERT sobrescreve com 'OP-AAAA-NNNN'.
        numero: '',
        produtoId: data.produtoId,
        variacaoId: data.variacaoId,
        quantidade: data.quantidade,
        maquinaId: data.maquinaId,
        canalDestino: data.canalDestino,
        prioridade: data.prioridade,
        status: data.status,
        dataPrevistaInicio: data.dataPrevistaInicio,
        dataPrevistaFim: data.dataPrevistaFim,
        criadoPor: user.id,
        responsavelId: data.responsavelId,
        observacoes: data.observacoes ?? null,
      })
      .returning({ id: ordensProducao.id, numero: ordensProducao.numero })

    // Evento inicial no kanban (statusAnterior = null).
    await tx.insert(eventosKanban).values({
      ordemId: inserted!.id,
      statusAnterior: null,
      statusNovo: data.status,
      usuarioId: user.id,
      observacao: 'OP criada',
    })

    return inserted!.id
  })

  revalidatePath('/ordens')
  revalidatePath('/producao')
  return { success: true, data: { id: novoId }, message: 'OP criada' }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarOrdemAction(
  id: string,
  input: OrdemInput,
): Promise<ActionResult> {
  const user = await requireRole(['admin', 'gerente_producao'])

  const parsed = ordemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select()
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'OP não encontrada' }
  }

  const statusMudou = atual.status !== data.status

  await db.transaction(async (tx) => {
    await tx
      .update(ordensProducao)
      .set({
        produtoId: data.produtoId,
        variacaoId: data.variacaoId,
        quantidade: data.quantidade,
        maquinaId: data.maquinaId,
        canalDestino: data.canalDestino,
        prioridade: data.prioridade,
        status: data.status,
        dataPrevistaInicio: data.dataPrevistaInicio,
        dataPrevistaFim: data.dataPrevistaFim,
        responsavelId: data.responsavelId,
        observacoes: data.observacoes ?? null,
        // Marca dataRealInicio quando entra em produção pela primeira vez.
        dataRealInicio:
          atual.dataRealInicio === null && data.status === 'em_producao'
            ? new Date()
            : atual.dataRealInicio,
        // Marca dataRealFim quando vira enviado.
        dataRealFim:
          data.status === 'enviado' ? atual.dataRealFim ?? new Date() : atual.dataRealFim,
      })
      .where(eq(ordensProducao.id, id))

    if (statusMudou) {
      await tx.insert(eventosKanban).values({
        ordemId: id,
        statusAnterior: atual.status,
        statusNovo: data.status,
        usuarioId: user.id,
      })
    }
  })

  revalidatePath('/ordens')
  revalidatePath(`/ordens/${id}`)
  revalidatePath('/producao')
  return { success: true, message: 'OP atualizada' }
}

// -----------------------------------------------------------------
// Mudar status (kanban / quick action)
// -----------------------------------------------------------------

export async function mudarStatusOrdemAction(
  id: string,
  input: MudarStatusOrdemInput,
): Promise<ActionResult> {
  const user = await requireAuth()

  const parsed = mudarStatusOrdemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select()
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'OP não encontrada' }
  }

  // Manager pode tudo. Operador só pode editar OP cuja máquina é a dele.
  const podeEditar = isManagerRole(user.role)
  let podeOperador = false
  if (!podeEditar && user.role === 'operador' && atual.maquinaId) {
    const [m] = await db
      .select({ operadorAtualId: maquinas.operadorAtualId })
      .from(maquinas)
      .where(eq(maquinas.id, atual.maquinaId))
      .limit(1)
    podeOperador = m?.operadorAtualId === user.id
  }
  if (!podeEditar && !podeOperador) {
    return { success: false, error: 'Sem permissão pra alterar essa OP' }
  }

  if (atual.status === data.status) {
    return { success: true, message: 'Status mantido' }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ordensProducao)
      .set({
        status: data.status,
        dataRealInicio:
          atual.dataRealInicio === null && data.status === 'em_producao'
            ? new Date()
            : atual.dataRealInicio,
        dataRealFim:
          data.status === 'enviado'
            ? atual.dataRealFim ?? new Date()
            : atual.dataRealFim,
      })
      .where(eq(ordensProducao.id, id))

    await tx.insert(eventosKanban).values({
      ordemId: id,
      statusAnterior: atual.status,
      statusNovo: data.status,
      usuarioId: user.id,
      observacao: data.observacao ?? null,
    })
  })

  revalidatePath('/ordens')
  revalidatePath(`/ordens/${id}`)
  revalidatePath('/producao')
  return { success: true, message: 'Status atualizado' }
}

// -----------------------------------------------------------------
// Soft delete (cancela e marca deletedAt)
// -----------------------------------------------------------------

export async function excluirOrdemAction(id: string): Promise<ActionResult> {
  const user = await requireRole(['admin', 'gerente_producao'])

  const [atual] = await db
    .select()
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'OP não encontrada' }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ordensProducao)
      .set({
        deletedAt: new Date(),
        status: atual.status === 'enviado' ? atual.status : 'cancelado',
      })
      .where(eq(ordensProducao.id, id))

    if (atual.status !== 'cancelado' && atual.status !== 'enviado') {
      await tx.insert(eventosKanban).values({
        ordemId: id,
        statusAnterior: atual.status,
        statusNovo: 'cancelado',
        usuarioId: user.id,
        observacao: 'OP excluída',
      })
    }
  })

  revalidatePath('/ordens')
  revalidatePath('/producao')
  return { success: true, message: 'OP excluída' }
}
