'use server'

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'

import {
  isManager as isManagerRole,
  requireAuth,
  requireAreaEscrita,
} from '@/lib/auth/require-auth'
import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { db } from '@/lib/db'
import {
  condicaoDeVisaoDoOperador,
  estacaoDoOperador,
  operadorPodeAgirNaOrdem,
} from '@/lib/db/estacao-operadores'
import {
  apontamentosProducao,
  eventosKanban,
  maquinas,
  movimentacoesEstoque,
  ordensProducao,
  produtos,
  remessasFull,
  users,
  variacoesProduto,
  type Maquina,
  type OrdemProducao,
  type Produto,
  type User,
  type VariacaoProduto,
} from '@/lib/db/schema'
import {
  apontamentoSchema,
  mudarStatusOrdemSchema,
  ordemRapidaSchema,
  ordemSchema,
  ordensFiltrosSchema,
  type ApontamentoInput,
  type MudarStatusOrdemInput,
  type OrdemRapidaInput,
  type OrdemInput,
  type OrdensFiltros,
  type statusValues,
} from '@/lib/validators/ordens'

// `assumiu` = a OP mudou de dono nesta ação. A tela usa isso pra avisar o
// operador que a OP agora é dele — troca silenciosa de dono é como o colega
// descobre do pior jeito que a OP não é mais dele.
export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string; assumiu?: boolean }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export type OrdemListItem = OrdemProducao & {
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoTamanho: string | null
  maquinaNome: string | null
  responsavelNome: string | null
  // "15/07" quando a OP pertence a uma remessa Full.
  remessaData: string | null
  atrasada: boolean
}

// Tamanho da página da listagem de ordens.
const ORDENS_POR_PAGINA = 50

export type OrdensPagina = {
  ordens: OrdemListItem[]
  total: number
  pagina: number
  totalPaginas: number
}

export async function listarOrdens(
  filtros: OrdensFiltros = {},
): Promise<OrdensPagina> {
  const user = await requireAuth()
  const parsed = ordensFiltrosSchema.safeParse(filtros)
  const f = parsed.success ? parsed.data : {}

  const conditions = [isNull(ordensProducao.deletedAt)]

  // O operador enxerga a fila comum + a estação dele. A regra mora em
  // src/lib/db/estacao-operadores.ts porque ela vale IGUAL aqui e na lista
  // de /ordens — eram duas cópias da versão antiga, e divergir faria a OP
  // aparecer no board e sumir da lista. Os demais cargos veem tudo.
  if (user.role === 'operador') {
    conditions.push(await condicaoDeVisaoDoOperador(user.id))
  }
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
  if (f.remessaId && f.remessaId.length > 0) {
    conditions.push(eq(ordensProducao.remessaFullId, f.remessaId))
  }

  // Total (com os mesmos filtros/joins) pra paginação.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(and(...conditions))

  const totalPaginas = Math.max(1, Math.ceil(total / ORDENS_POR_PAGINA))
  const pagina = Math.min(f.pagina ?? 1, totalPaginas)

  const rows = await db
    .select({
      op: ordensProducao,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoTamanho: variacoesProduto.tamanho,
      maquinaNome: maquinas.nome,
      responsavelNome: users.nome,
      remessaDataEnvio: remessasFull.dataEnvio,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    .where(and(...conditions))
    .orderBy(desc(ordensProducao.createdAt))
    .limit(ORDENS_POR_PAGINA)
    .offset((pagina - 1) * ORDENS_POR_PAGINA)

  const now = Date.now()
  const ordens = rows.map(
    ({
      op,
      produtoNome,
      produtoSku,
      variacaoCor,
      variacaoTamanho,
      maquinaNome,
      responsavelNome,
      remessaDataEnvio,
    }) => ({
      ...op,
      produtoNome,
      produtoSku,
      variacaoCor: variacaoCor ?? null,
      variacaoTamanho: variacaoTamanho ?? null,
      maquinaNome: maquinaNome ?? null,
      responsavelNome: responsavelNome ?? null,
      remessaData: remessaDataEnvio
        ? `${remessaDataEnvio.slice(8, 10)}/${remessaDataEnvio.slice(5, 7)}`
        : null,
      atrasada:
        op.dataPrevistaFim !== null &&
        op.status !== 'enviado' &&
        op.status !== 'cancelado' &&
        new Date(op.dataPrevistaFim).getTime() < now,
    }),
  )

  return { ordens, total, pagina, totalPaginas }
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
  const user = await requireAreaEscrita('ordens')

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
// Criar OP rápida (no próprio kanban) — operador também pode
// -----------------------------------------------------------------

export async function criarOrdemRapidaAction(
  input: OrdemRapidaInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAuth()
  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão pra criar OP no kanban' }
  }

  const parsed = ordemRapidaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // Operador que cria a corridinha já fica como dono; gerente deixa na fila.
  const responsavelId = user.role === 'operador' ? user.id : null

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(ordensProducao)
      .values({
        numero: '',
        produtoId: data.produtoId,
        variacaoId: data.variacaoId ?? null,
        quantidade: data.quantidade,
        canalDestino: data.canalDestino,
        prioridade: data.prioridade,
        status: 'programado',
        criadoPor: user.id,
        responsavelId,
      })
      .returning({ id: ordensProducao.id })

    await tx.insert(eventosKanban).values({
      ordemId: inserted!.id,
      statusAnterior: null,
      statusNovo: 'programado',
      usuarioId: user.id,
      observacao: 'OP rápida criada',
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
  const user = await requireAreaEscrita('ordens')

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

  // Permissão pelo nível do kanban (editável em /permissoes).
  // O operador é sempre limitado à OP que é dele, mesmo com "controle total".
  const nivelKanban = await nivelDaAreaPara(user.role, 'kanban')
  if (!podeEscrever(nivelKanban)) {
    return { success: false, error: 'Sem permissão pra mover OPs no kanban' }
  }
  // O operador age em qualquer OP da estação dele, não só na que pegou —
  // e ao agir ele VIRA o responsável (ver `assumiu` abaixo).
  let assumiu = false
  if (user.role === 'operador') {
    const permissao = await operadorPodeAgirNaOrdem(user.id, atual.maquinaId)
    if (!permissao.pode) {
      return { success: false, error: permissao.erro }
    }
    assumiu = atual.responsavelId !== user.id
  }

  if (atual.status === data.status) {
    return { success: true, message: 'Status mantido' }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ordensProducao)
      .set({
        status: data.status,
        // A OP SEGUE O OPERADOR QUE MEXEU POR ÚLTIMO. É assim que a virada de
        // turno fica registrada sozinha: o operador 1 sai no meio, o 2
        // continua, e a OP passa a mostrar o 2.
        //
        // ADMIN E GERENTE NÃO TOMAM A OP: `assumiu` só fica true pra
        // role === 'operador'. Eles interagem, a interação vai pro
        // eventos_kanban, mas a posse continua do chão da estação — é o que
        // mantém o relatório dizendo quem estava na máquina.
        ...(assumiu ? { responsavelId: user.id } : {}),
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

    // OP concluída (enviado) pro canal "Estoque" entra no estoque — uma vez só.
    if (data.status === 'enviado' && atual.canalDestino === 'estoque') {
      const [existente] = await tx
        .select({ id: movimentacoesEstoque.id })
        .from(movimentacoesEstoque)
        .where(
          and(
            eq(movimentacoesEstoque.referenciaId, id),
            eq(movimentacoesEstoque.tipo, 'entrada_producao'),
          ),
        )
        .limit(1)
      if (!existente) {
        const [agg] = await tx
          .select({
            total: sql<number>`coalesce(sum(${apontamentosProducao.quantidadeProduzida}), 0)::int`,
          })
          .from(apontamentosProducao)
          .where(eq(apontamentosProducao.ordemId, id))
        const qtd = (agg?.total ?? 0) > 0 ? agg!.total : atual.quantidade
        if (qtd > 0) {
          await tx.insert(movimentacoesEstoque).values({
            produtoId: atual.produtoId,
            variacaoId: atual.variacaoId,
            tipo: 'entrada_producao',
            quantidade: qtd,
            referenciaId: id,
            referenciaTipo: 'ordem',
            usuarioId: user.id,
          })
        }
      }
    }
  })

  revalidatePath('/ordens')
  revalidatePath(`/ordens/${id}`)
  revalidatePath('/producao')
  revalidatePath('/estoque')
  return { success: true, message: 'Status atualizado', assumiu }
}

// -----------------------------------------------------------------
// Histórico da OP (leitura pura — nenhuma tabela nova)
// -----------------------------------------------------------------
// `eventos_kanban` grava desde sempre usuario_id, status_anterior,
// status_novo, observacao e created_at a cada movimento — são 9 pontos no
// código escrevendo nela. E até aqui NADA no sistema lia isso pra exibir: a
// única leitura era um MAX(created_at) em producao/actions.ts pra calcular
// tempo parado na etapa. Era uma trilha de auditoria completa e invisível.
//
// Os apontamentos entram na MESMA linha do tempo porque também têm autor e
// hora; separados, cada metade conta metade da história.
//
// É isto que responde "o admin/gerente mexeu nessa OP?" — justamente o caso
// que o item C deixa acontecer sem trocar o responsável.

export type ItemDoHistorico = {
  em: Date
  autorNome: string | null
} & (
  | {
      tipo: 'status'
      statusAnterior: (typeof statusValues)[number] | null
      statusNovo: (typeof statusValues)[number]
      observacao: string | null
    }
  | {
      tipo: 'apontamento'
      produzida: number
      refugo: number
    }
)

export async function historicoDaOrdem(
  ordemId: string,
): Promise<ItemDoHistorico[]> {
  await requireAuth()
  if (!uuidRe.test(ordemId)) return []

  const autor = alias(users, 'autor_do_evento')

  const [eventos, apontamentos] = await Promise.all([
    db
      .select({
        em: eventosKanban.createdAt,
        autorNome: autor.nome,
        statusAnterior: eventosKanban.statusAnterior,
        statusNovo: eventosKanban.statusNovo,
        observacao: eventosKanban.observacao,
      })
      .from(eventosKanban)
      .leftJoin(autor, eq(autor.id, eventosKanban.usuarioId))
      .where(eq(eventosKanban.ordemId, ordemId)),
    db
      .select({
        em: apontamentosProducao.createdAt,
        autorNome: users.nome,
        produzida: apontamentosProducao.quantidadeProduzida,
        refugo: apontamentosProducao.quantidadeRefugo,
      })
      .from(apontamentosProducao)
      .leftJoin(users, eq(users.id, apontamentosProducao.operadorId))
      .where(eq(apontamentosProducao.ordemId, ordemId)),
  ])

  const itens: ItemDoHistorico[] = [
    ...eventos.map(
      (e): ItemDoHistorico => ({
        tipo: 'status',
        em: e.em,
        autorNome: e.autorNome ?? null,
        statusAnterior: e.statusAnterior,
        statusNovo: e.statusNovo,
        observacao: e.observacao,
      }),
    ),
    ...apontamentos.map(
      (a): ItemDoHistorico => ({
        tipo: 'apontamento',
        em: a.em,
        autorNome: a.autorNome ?? null,
        produzida: a.produzida,
        refugo: a.refugo,
      }),
    ),
  ]

  // Cronológica INVERSA: o que aconteceu por último aparece primeiro.
  return itens.sort((a, b) => b.em.getTime() - a.em.getTime())
}

// -----------------------------------------------------------------
// Pegar / soltar OP (fluxo puxado: operador assume a OP da fila)
// -----------------------------------------------------------------

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Máquina de uma estação, com quem está nela agora.
export type MaquinaParaPegar = {
  id: string
  codigo: string
  nome: string
  // Número da OP que está EM PRODUÇÃO nesta máquina, ou null se está livre.
  ocupadaPorOp: string | null
}

export type MaquinasParaPegar = {
  estacaoNome: string | null
  maquinas: MaquinaParaPegar[]
}

/**
 * As máquinas que o usuário pode escolher ao pegar uma OP.
 *
 * Operador: só as da estação dele. Admin/gerente não têm estação, então
 * recebem todas as vivas — o botão "Pegar pra mim" nem aparece pra eles, mas
 * a permissão continua existindo.
 *
 * O left join não pode duplicar linha de máquina: o índice único
 * `ordens_producao_maquina_em_producao_uidx` (migration 50) garante no máximo
 * uma OP em produção por máquina.
 */
export async function listarMaquinasParaPegar(): Promise<
  ActionResult<MaquinasParaPegar>
> {
  const user = await requireAuth()
  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão no kanban' }
  }

  let estacaoNome: string | null = null
  let filtroDeEstacao
  if (user.role === 'operador') {
    const estacao = await estacaoDoOperador(user.id)
    if (!estacao) {
      return {
        success: false,
        error: 'Você não está em nenhuma estação — fale com o admin',
      }
    }
    estacaoNome = estacao.nome
    filtroDeEstacao = eq(maquinas.estacaoId, estacao.id)
  }

  const rows = await db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      ocupadaPorOp: ordensProducao.numero,
    })
    .from(maquinas)
    .leftJoin(
      ordensProducao,
      and(
        eq(ordensProducao.maquinaId, maquinas.id),
        // "Ocupada" é `em_producao`, e não "status ativo": é o único status
        // em que a OP está FISICAMENTE na máquina. Com "ativo", a OP parada
        // em pronto_envio seguiria segurando a máquina e, com o tempo, todas
        // ficariam ocupadas sem ninguém produzindo — o sistema travaria
        // sozinho. Mover pra pronto_envio libera.
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .where(and(isNull(maquinas.deletedAt), filtroDeEstacao))
    .orderBy(asc(maquinas.codigo))

  return {
    success: true,
    data: {
      estacaoNome,
      maquinas: rows.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nome: r.nome,
        ocupadaPorOp: r.ocupadaPorOp ?? null,
      })),
    },
  }
}

/**
 * Revalida a máquina no SERVIDOR. O diálogo do cliente é conveniência: quem
 * decide é isto aqui. Devolve a mensagem de erro, ou null se está tudo certo.
 */
async function validarMaquinaParaOrdem(
  maquinaId: string,
  estacaoId: string | null,
  ordemId: string,
): Promise<string | null> {
  if (!uuidRe.test(maquinaId)) return 'Máquina inválida'

  const [maquina] = await db
    .select({ id: maquinas.id, codigo: maquinas.codigo })
    .from(maquinas)
    .where(
      and(
        eq(maquinas.id, maquinaId),
        isNull(maquinas.deletedAt),
        estacaoId ? eq(maquinas.estacaoId, estacaoId) : undefined,
      ),
    )
    .limit(1)
  if (!maquina) {
    return estacaoId
      ? 'Essa máquina não é da sua estação'
      : 'Máquina não encontrada'
  }

  const [ocupada] = await db
    .select({ numero: ordensProducao.numero })
    .from(ordensProducao)
    .where(
      and(
        eq(ordensProducao.maquinaId, maquinaId),
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.id, ordemId),
      ),
    )
    .limit(1)
  if (ocupada) {
    return `A máquina ${maquina.codigo} já está com a OP ${ocupada.numero}`
  }
  return null
}

// A checagem acima tem janela entre o SELECT e o UPDATE. Quem fecha de
// verdade é o índice único do banco; isto só traduz o 23505 pra português.
function ehConflitoDeMaquina(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  const e = erro as { code?: string; constraint_name?: string }
  return (
    e.code === '23505' &&
    e.constraint_name === 'ordens_producao_maquina_em_producao_uidx'
  )
}

/**
 * "Pegar pra mim" — fluxo puxado. Só pra OP SEM responsável.
 *
 * ESCOLHER MÁQUINA É OBRIGATÓRIO quando a OP ainda não tem uma: é isso que
 * torna verdadeira a premissa do item C (OP em produção sempre tem máquina,
 * logo sempre tem estação). Se a OP já tem máquina, não pergunta de novo —
 * a máquina dela é a resposta.
 */
export async function pegarOrdemAction(
  id: string,
  maquinaId?: string,
): Promise<ActionResult> {
  const user = await requireAuth()
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão pra pegar OPs no kanban' }
  }

  const [atual] = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      responsavelId: ordensProducao.responsavelId,
      maquinaId: ordensProducao.maquinaId,
      dataRealInicio: ordensProducao.dataRealInicio,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'OP não encontrada' }

  if (atual.responsavelId && atual.responsavelId !== user.id) {
    return { success: false, error: 'Essa OP já foi pega por outro operador' }
  }

  // Só o OPERADOR é preso à estação. Admin e gerente não têm estação e
  // continuam podendo interagir — o botão é que some pra eles na tela.
  let estacaoId: string | null = null
  if (user.role === 'operador') {
    const estacao = await estacaoDoOperador(user.id)
    if (!estacao) {
      return {
        success: false,
        error: 'Você não está em nenhuma estação — fale com o admin',
      }
    }
    estacaoId = estacao.id
  }

  const maquinaEscolhida = atual.maquinaId ?? maquinaId ?? null
  if (!maquinaEscolhida) {
    return { success: false, error: 'Escolha uma máquina pra pegar a OP' }
  }
  const erroDaMaquina = await validarMaquinaParaOrdem(
    maquinaEscolhida,
    estacaoId,
    id,
  )
  if (erroDaMaquina) return { success: false, error: erroDaMaquina }

  // Ao pegar a OP, ela já entra em produção se ainda estava na fila
  // (registra o evento no kanban e marca o início real da produção).
  const entraEmProducao =
    atual.status === 'programado' ||
    atual.status === 'aguardando_materia_prima'

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(ordensProducao)
        .set({
          responsavelId: user.id,
          maquinaId: maquinaEscolhida,
          ...(entraEmProducao
            ? {
                status: 'em_producao' as const,
                dataRealInicio: atual.dataRealInicio ?? new Date(),
              }
            : {}),
        })
        .where(eq(ordensProducao.id, id))

      if (entraEmProducao) {
        await tx.insert(eventosKanban).values({
          ordemId: id,
          statusAnterior: atual.status,
          statusNovo: 'em_producao',
          usuarioId: user.id,
          observacao: 'Entrou em produção ao ser pega pelo operador',
        })
      }
    })
  } catch (erro) {
    if (ehConflitoDeMaquina(erro)) {
      return {
        success: false,
        error: 'Alguém pegou essa máquina agora mesmo. Escolha outra.',
      }
    }
    throw erro
  }

  revalidatePath('/producao')
  revalidatePath('/ordens')
  return {
    success: true,
    message: entraEmProducao
      ? 'OP é sua e entrou em produção'
      : 'OP é sua agora',
  }
}

export async function soltarOrdemAction(id: string): Promise<ActionResult> {
  const user = await requireAuth()
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão no kanban' }
  }

  const [atual] = await db
    .select({
      id: ordensProducao.id,
      responsavelId: ordensProducao.responsavelId,
      maquinaId: ordensProducao.maquinaId,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'OP não encontrada' }

  // O operador solta qualquer OP da estação dele — inclusive a que o colega
  // pegou. Gerente e admin soltam qualquer uma.
  if (user.role === 'operador') {
    const permissao = await operadorPodeAgirNaOrdem(user.id, atual.maquinaId)
    if (!permissao.pode) {
      return { success: false, error: permissao.erro }
    }
  } else if (
    !isManagerRole(user.role) &&
    atual.responsavelId &&
    atual.responsavelId !== user.id
  ) {
    return { success: false, error: 'Só quem pegou pode soltar' }
  }

  // SOLTAR NÃO TOMA A OP. É a exceção à regra do "a OP segue quem mexeu" —
  // esta ação existe justamente pra LIMPAR o responsável.

  await db
    .update(ordensProducao)
    .set({ responsavelId: null })
    .where(eq(ordensProducao.id, id))

  revalidatePath('/producao')
  revalidatePath('/ordens')
  return { success: true, message: 'OP voltou pra fila' }
}

// -----------------------------------------------------------------
// Apontar produção + listar apontamentos
// -----------------------------------------------------------------

export type ApontamentoItem = {
  id: string
  operadorNome: string | null
  produzida: number
  refugo: number
  em: Date
}

export async function listarApontamentos(ordemId: string): Promise<{
  itens: ApontamentoItem[]
  totalProduzido: number
  totalRefugo: number
}> {
  await requireAuth()
  if (!uuidRe.test(ordemId)) {
    return { itens: [], totalProduzido: 0, totalRefugo: 0 }
  }

  const rows = await db
    .select({
      id: apontamentosProducao.id,
      produzida: apontamentosProducao.quantidadeProduzida,
      refugo: apontamentosProducao.quantidadeRefugo,
      em: apontamentosProducao.inicio,
      operadorNome: users.nome,
    })
    .from(apontamentosProducao)
    .leftJoin(users, eq(users.id, apontamentosProducao.operadorId))
    .where(eq(apontamentosProducao.ordemId, ordemId))
    .orderBy(desc(apontamentosProducao.inicio))

  const itens: ApontamentoItem[] = rows.map((r) => ({
    id: r.id,
    operadorNome: r.operadorNome ?? null,
    produzida: r.produzida,
    refugo: r.refugo,
    em: r.em,
  }))
  return {
    itens,
    totalProduzido: itens.reduce((s, i) => s + i.produzida, 0),
    totalRefugo: itens.reduce((s, i) => s + i.refugo, 0),
  }
}

export async function apontarProducaoAction(
  ordemId: string,
  input: ApontamentoInput,
): Promise<ActionResult> {
  const user = await requireAuth()
  if (!uuidRe.test(ordemId)) return { success: false, error: 'ID inválido' }

  const parsed = apontamentoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [op] = await db
    .select({
      id: ordensProducao.id,
      responsavelId: ordensProducao.responsavelId,
      maquinaId: ordensProducao.maquinaId,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, ordemId), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!op) return { success: false, error: 'OP não encontrada' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão pra apontar produção' }
  }
  // Mesma regra do mover: é da estação dele, e apontar TOMA a OP.
  let assumiu = false
  if (user.role === 'operador') {
    const permissao = await operadorPodeAgirNaOrdem(user.id, op.maquinaId)
    if (!permissao.pode) {
      return { success: false, error: permissao.erro }
    }
    assumiu = op.responsavelId !== user.id
  } else if (!isManagerRole(user.role) && op.responsavelId !== user.id) {
    return { success: false, error: 'Pegue a OP pra você antes de apontar' }
  }

  const agora = new Date()
  await db.insert(apontamentosProducao).values({
    ordemId,
    operadorId: user.id,
    inicio: agora,
    fim: agora,
    quantidadeProduzida: data.produzida,
    quantidadeRefugo: data.refugo,
  })

  revalidatePath('/producao')
  // Admin e gerente apontam sem tomar a OP — a posse fica com o operador.
  if (assumiu) {
    await db
      .update(ordensProducao)
      .set({ responsavelId: user.id })
      .where(eq(ordensProducao.id, ordemId))
  }

  revalidatePath('/dashboard')
  revalidatePath(`/ordens/${ordemId}`)
  return { success: true, message: 'Apontamento registrado', assumiu }
}

// -----------------------------------------------------------------
// Soft delete (cancela e marca deletedAt)
// -----------------------------------------------------------------

export async function excluirOrdemAction(id: string): Promise<ActionResult> {
  const user = await requireAreaEscrita('ordens')

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

// -----------------------------------------------------------------
// Excluir múltiplas OPs (bulk delete)
// -----------------------------------------------------------------

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function excluirMultiplasOrdensAction(
  ids: string[],
): Promise<ActionResult<{ excluidas: number }>> {
  const user = await requireAreaEscrita('ordens')

  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'Selecione ao menos uma OP' }
  }
  const idsValidos = ids.filter((id) => uuidRegex.test(id))
  if (idsValidos.length === 0) {
    return { success: false, error: 'Nenhum ID válido na seleção' }
  }

  // Carrega as OPs ativas pra gerar eventos kanban depois.
  const opsAtivas = await db
    .select({ id: ordensProducao.id, status: ordensProducao.status })
    .from(ordensProducao)
    .where(
      and(
        inArray(ordensProducao.id, idsValidos),
        isNull(ordensProducao.deletedAt),
      ),
    )

  if (opsAtivas.length === 0) {
    return { success: false, error: 'Nenhuma OP encontrada' }
  }

  await db.transaction(async (tx) => {
    const now = new Date()
    // Marca como cancelado quando não estava enviado/cancelado
    await tx
      .update(ordensProducao)
      .set({ deletedAt: now })
      .where(inArray(ordensProducao.id, opsAtivas.map((o) => o.id)))

    // Vira "cancelado" só pras que ainda estavam ativas
    const paraCancelar = opsAtivas
      .filter((o) => o.status !== 'enviado' && o.status !== 'cancelado')
      .map((o) => o.id)

    if (paraCancelar.length > 0) {
      await tx
        .update(ordensProducao)
        .set({ status: 'cancelado' })
        .where(inArray(ordensProducao.id, paraCancelar))

      // Gera eventos kanban (statusAnterior é o status antigo de cada OP)
      const eventos = opsAtivas
        .filter((o) => o.status !== 'enviado' && o.status !== 'cancelado')
        .map((o) => ({
          ordemId: o.id,
          statusAnterior: o.status,
          statusNovo: 'cancelado' as const,
          usuarioId: user.id,
          observacao: 'OP excluída em massa',
        }))
      await tx.insert(eventosKanban).values(eventos)
    }
  })

  revalidatePath('/ordens')
  revalidatePath('/producao')
  return {
    success: true,
    data: { excluidas: opsAtivas.length },
    message:
      opsAtivas.length === 1
        ? '1 OP excluída'
        : `${opsAtivas.length} OPs excluídas`,
  }
}
