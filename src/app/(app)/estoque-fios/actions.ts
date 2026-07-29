'use server'

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import {
  cores,
  coresFornecedorFio,
  lotesFio,
  movimentacoesFio,
  users,
  type CorFornecedorFio,
} from '@/lib/db/schema'
import {
  corFornecedorSchema,
  loteFioSchema,
  saidaFioSchema,
  type CorFornecedorInput,
  type LoteFioInput,
  type SaidaFioInput,
} from '@/lib/validators/fios'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Cores do fornecedor (de-para)
// -----------------------------------------------------------------

export type CorFornecedorItem = CorFornecedorFio & {
  corNome: string
  corHex: string | null
}

export async function listarCoresFornecedor(): Promise<CorFornecedorItem[]> {
  await requireAuth()
  const rows = await db
    .select({
      cf: coresFornecedorFio,
      corNome: cores.nome,
      corHex: cores.codigoHex,
    })
    .from(coresFornecedorFio)
    .innerJoin(cores, eq(cores.id, coresFornecedorFio.corId))
    .where(isNull(coresFornecedorFio.deletedAt))
    .orderBy(asc(coresFornecedorFio.nomeFornecedor))

  return rows.map((r) => ({ ...r.cf, corNome: r.corNome, corHex: r.corHex }))
}

// Só ativas — usado no select do formulário de entrada de lote.
export async function listarCoresFornecedorAtivas(): Promise<
  CorFornecedorItem[]
> {
  await requireAuth()
  const rows = await db
    .select({
      cf: coresFornecedorFio,
      corNome: cores.nome,
      corHex: cores.codigoHex,
    })
    .from(coresFornecedorFio)
    .innerJoin(cores, eq(cores.id, coresFornecedorFio.corId))
    .where(
      and(isNull(coresFornecedorFio.deletedAt), eq(coresFornecedorFio.ativo, true)),
    )
    .orderBy(asc(coresFornecedorFio.nomeFornecedor))

  return rows.map((r) => ({ ...r.cf, corNome: r.corNome, corHex: r.corHex }))
}

export async function criarCorFornecedorAction(
  input: CorFornecedorInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('estoqueFios')

  const parsed = corFornecedorSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  let inserted: { id: string } | undefined
  try {
    ;[inserted] = await db
      .insert(coresFornecedorFio)
      .values({
        nomeFornecedor: data.nomeFornecedor,
        corId: data.corId,
        ativo: data.ativo,
      })
      .returning({ id: coresFornecedorFio.id })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        error: `Já existe uma cor de fornecedor "${data.nomeFornecedor}"`,
      }
    }
    throw err
  }

  revalidatePath('/estoque-fios')
  return { success: true, data: { id: inserted!.id }, message: 'Cor cadastrada' }
}

export async function atualizarCorFornecedorAction(
  id: string,
  input: CorFornecedorInput,
): Promise<ActionResult> {
  await requireAreaEscrita('estoqueFios')

  const parsed = corFornecedorSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: coresFornecedorFio.id })
    .from(coresFornecedorFio)
    .where(and(eq(coresFornecedorFio.id, id), isNull(coresFornecedorFio.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Cor de fornecedor não encontrada' }
  }

  try {
    await db
      .update(coresFornecedorFio)
      .set({
        nomeFornecedor: data.nomeFornecedor,
        corId: data.corId,
        ativo: data.ativo,
      })
      .where(eq(coresFornecedorFio.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        error: `Já existe uma cor de fornecedor "${data.nomeFornecedor}"`,
      }
    }
    throw err
  }

  revalidatePath('/estoque-fios')
  return { success: true, message: 'Cor atualizada' }
}

export async function excluirCorFornecedorAction(
  id: string,
): Promise<ActionResult> {
  await requireAreaEscrita('estoqueFios')

  const [atual] = await db
    .select({ id: coresFornecedorFio.id })
    .from(coresFornecedorFio)
    .where(and(eq(coresFornecedorFio.id, id), isNull(coresFornecedorFio.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Cor de fornecedor não encontrada' }
  }

  await db
    .update(coresFornecedorFio)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(coresFornecedorFio.id, id))

  revalidatePath('/estoque-fios')
  return { success: true, message: 'Cor excluída' }
}

// -----------------------------------------------------------------
// Entradas de lote de fio
// -----------------------------------------------------------------

export type LoteFioItem = {
  id: string
  numeroLote: string
  corFornecedorId: string
  corFornecedorNome: string
  corNome: string
  corHex: string | null
  caixas: number
  pesoTotalKg: string
  valorTotal: string
  vendedor: string
  dataEntrada: string
  vencimentoPagamento: string
  notaFiscal: string | null
  observacao: string | null
  saidaCaixas: number
  saidaPesoKg: string
  saldoCaixas: number
  saldoPesoKg: string
}

export async function listarLotesFio(): Promise<LoteFioItem[]> {
  await requireAuth()

  // Nota: a referência a "lotes_fio"."id" precisa ficar qualificada com o
  // nome da tabela — interpolar ${lotesFio.id} aqui (via tag `sql`) gera só
  // o identificador da coluna sem qualificar, e como `movimentacoes_fio`
  // também tem uma coluna `id`, o Postgres resolve pro escopo mais interno
  // (a subquery) em vez de correlacionar com a tabela externa.
  const saidaCaixasSql = sql<number>`(
    SELECT COALESCE(SUM(${movimentacoesFio.caixas}), 0)::int
    FROM ${movimentacoesFio}
    WHERE ${movimentacoesFio.loteId} = "lotes_fio"."id"
  )`
  const saidaPesoSql = sql<string>`(
    SELECT COALESCE(SUM(${movimentacoesFio.pesoKg}), 0)
    FROM ${movimentacoesFio}
    WHERE ${movimentacoesFio.loteId} = "lotes_fio"."id"
  )`

  const rows = await db
    .select({
      id: lotesFio.id,
      numeroLote: lotesFio.numeroLote,
      corFornecedorId: lotesFio.corFornecedorId,
      corFornecedorNome: coresFornecedorFio.nomeFornecedor,
      corNome: cores.nome,
      corHex: cores.codigoHex,
      caixas: lotesFio.caixas,
      pesoTotalKg: lotesFio.pesoTotalKg,
      valorTotal: lotesFio.valorTotal,
      vendedor: lotesFio.vendedor,
      dataEntrada: lotesFio.dataEntrada,
      vencimentoPagamento: lotesFio.vencimentoPagamento,
      notaFiscal: lotesFio.notaFiscal,
      observacao: lotesFio.observacao,
      saidaCaixas: saidaCaixasSql,
      saidaPesoKg: saidaPesoSql,
    })
    .from(lotesFio)
    .innerJoin(coresFornecedorFio, eq(coresFornecedorFio.id, lotesFio.corFornecedorId))
    .innerJoin(cores, eq(cores.id, coresFornecedorFio.corId))
    .where(isNull(lotesFio.deletedAt))
    .orderBy(desc(lotesFio.dataEntrada), desc(lotesFio.createdAt))

  return rows.map((r) => ({
    ...r,
    saldoCaixas: r.caixas - r.saidaCaixas,
    saldoPesoKg: (Number(r.pesoTotalKg) - Number(r.saidaPesoKg)).toFixed(2),
  }))
}

export async function criarLoteFioAction(
  input: LoteFioInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('estoqueFios')

  const parsed = loteFioSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [inserted] = await db
    .insert(lotesFio)
    .values({
      numeroLote: data.numeroLote,
      corFornecedorId: data.corFornecedorId,
      caixas: data.caixas,
      pesoTotalKg: data.pesoTotalKg,
      valorTotal: data.valorTotal,
      vendedor: data.vendedor,
      dataEntrada: data.dataEntrada,
      vencimentoPagamento: data.vencimentoPagamento,
      notaFiscal: data.notaFiscal ?? null,
      observacao: data.observacao ?? null,
    })
    .returning({ id: lotesFio.id })

  revalidatePath('/estoque-fios')
  return { success: true, data: { id: inserted!.id }, message: 'Lote cadastrado' }
}

export async function atualizarLoteFioAction(
  id: string,
  input: LoteFioInput,
): Promise<ActionResult> {
  await requireAreaEscrita('estoqueFios')

  const parsed = loteFioSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: lotesFio.id })
    .from(lotesFio)
    .where(and(eq(lotesFio.id, id), isNull(lotesFio.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Lote não encontrado' }
  }

  await db
    .update(lotesFio)
    .set({
      numeroLote: data.numeroLote,
      corFornecedorId: data.corFornecedorId,
      caixas: data.caixas,
      pesoTotalKg: data.pesoTotalKg,
      valorTotal: data.valorTotal,
      vendedor: data.vendedor,
      dataEntrada: data.dataEntrada,
      vencimentoPagamento: data.vencimentoPagamento,
      notaFiscal: data.notaFiscal ?? null,
      observacao: data.observacao ?? null,
    })
    .where(eq(lotesFio.id, id))

  revalidatePath('/estoque-fios')
  return { success: true, message: 'Lote atualizado' }
}

export async function excluirLoteFioAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('estoqueFios')

  const [atual] = await db
    .select({ id: lotesFio.id })
    .from(lotesFio)
    .where(and(eq(lotesFio.id, id), isNull(lotesFio.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Lote não encontrado' }
  }

  await db
    .update(lotesFio)
    .set({ deletedAt: new Date() })
    .where(eq(lotesFio.id, id))

  revalidatePath('/estoque-fios')
  return { success: true, message: 'Lote excluído' }
}

// -----------------------------------------------------------------
// Saídas de fio (retirada de um lote)
// -----------------------------------------------------------------

export type SaidaFioItem = {
  id: string
  loteId: string
  caixas: number
  pesoKg: string
  data: string
  motivo: string
  observacao: string | null
  usuarioNome: string | null
  createdAt: Date
}

export async function listarSaidasDoLote(loteId: string): Promise<SaidaFioItem[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: movimentacoesFio.id,
      loteId: movimentacoesFio.loteId,
      caixas: movimentacoesFio.caixas,
      pesoKg: movimentacoesFio.pesoKg,
      data: movimentacoesFio.data,
      motivo: movimentacoesFio.motivo,
      observacao: movimentacoesFio.observacao,
      usuarioNome: users.nome,
      createdAt: movimentacoesFio.createdAt,
    })
    .from(movimentacoesFio)
    .leftJoin(users, eq(users.id, movimentacoesFio.usuarioId))
    .where(eq(movimentacoesFio.loteId, loteId))
    .orderBy(desc(movimentacoesFio.data), desc(movimentacoesFio.createdAt))

  return rows
}

async function saldoAtualDoLote(
  loteId: string,
): Promise<{ caixas: number; pesoKg: number; loteCaixas: number } | null> {
  const [lote] = await db
    .select({ caixas: lotesFio.caixas, pesoTotalKg: lotesFio.pesoTotalKg })
    .from(lotesFio)
    .where(and(eq(lotesFio.id, loteId), isNull(lotesFio.deletedAt)))
    .limit(1)
  if (!lote) return null

  const [saidas] = await db
    .select({
      caixas: sql<number>`COALESCE(SUM(${movimentacoesFio.caixas}), 0)::int`,
      pesoKg: sql<string>`COALESCE(SUM(${movimentacoesFio.pesoKg}), 0)`,
    })
    .from(movimentacoesFio)
    .where(eq(movimentacoesFio.loteId, loteId))

  return {
    caixas: lote.caixas - (saidas?.caixas ?? 0),
    pesoKg: Number(lote.pesoTotalKg) - Number(saidas?.pesoKg ?? 0),
    loteCaixas: lote.caixas,
  }
}

export async function registrarSaidaFioAction(
  input: SaidaFioInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAreaEscrita('estoqueFios')

  const parsed = saidaFioSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const saldo = await saldoAtualDoLote(data.loteId)
  if (!saldo) {
    return { success: false, error: 'Lote não encontrado' }
  }
  if (data.caixas > saldo.caixas) {
    return {
      success: false,
      error: `Saldo insuficiente: restam ${saldo.caixas} caixa(s) nesse lote`,
    }
  }
  if (Number(data.pesoKg) > saldo.pesoKg + 0.01) {
    return {
      success: false,
      error: `Saldo insuficiente: restam ${saldo.pesoKg.toFixed(2)}kg nesse lote`,
    }
  }

  const [inserted] = await db
    .insert(movimentacoesFio)
    .values({
      loteId: data.loteId,
      caixas: data.caixas,
      pesoKg: data.pesoKg,
      data: data.data,
      motivo: data.motivo,
      observacao: data.observacao ?? null,
      usuarioId: user.id,
    })
    .returning({ id: movimentacoesFio.id })

  revalidatePath('/estoque-fios')
  return { success: true, data: { id: inserted!.id }, message: 'Saída registrada' }
}
