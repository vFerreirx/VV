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
  calcularTotais,
  chaveDeLote,
  parseFiosCSV,
  type LinhaFio,
  type TotaisImport,
} from '@/lib/fios/importar-csv'
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
  // Null quando o lote não tem número — acontece de verdade na planilha da
  // fábrica. Ver `supabase/sql/44_lotes_fio_opcionais.sql`.
  numeroLote: string | null
  corFornecedorId: string
  corFornecedorNome: string
  corId: string
  corNome: string
  corHex: string | null
  caixas: number
  pesoTotalKg: string
  valorTotal: string | null
  vendedor: string | null
  dataEntrada: string
  vencimentoPagamento: string | null
  notaFiscal: string | null
  observacao: string | null
  saidaCaixas: number
  saidaPesoKg: string
  saldoCaixas: number
  saldoPesoKg: number
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
      corId: cores.id,
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
    // 2 casas: é a precisão da coluna, e somar floats de 50 lotes sem
    // arredondar faz o rodapé fechar com centavo de kg sobrando.
    saldoPesoKg:
      Math.round((Number(r.pesoTotalKg) - Number(r.saidaPesoKg)) * 100) / 100,
  }))
}

// O saldo por cor NÃO tem action própria: sai do mesmo `listarLotesFio`
// (uma consulta agregada só) agrupado por `agruparSaldoPorCor`, que a
// página chama direto — função pura não precisa atravessar a fronteira
// server/client, e uma segunda consulta pro mesmo dado seria desperdício.

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
      // Os quatro abaixo aceitam null: campo vazio quer dizer "não tem",
      // e nunca zero/"" — ver o comentário do schema de `lotesFio`.
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
      // Os quatro abaixo aceitam null: campo vazio quer dizer "não tem",
      // e nunca zero/"" — ver o comentário do schema de `lotesFio`.
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

// -----------------------------------------------------------------
// Import da planilha de fios (CSV)
// -----------------------------------------------------------------

// A linha do arquivo mais o que só o banco sabe: se esse lote já está lá.
export type LinhaAnalisada = LinhaFio & { jaExiste: boolean }

export type AnaliseImportFios = {
  linhas: LinhaAnalisada[]
  ignoradas: string[]
  atencoes: string[]
  // Mensagens sobre lotes que JÁ EXISTEM no banco. Ficam separadas das
  // atenções porque têm um botão associado: entram só se o usuário mandar.
  duplicadas: string[]
  totais: TotaisImport
  totaisSemDuplicadas: TotaisImport
}

const MOTIVO_IMPORT = 'Retirada acumulada na planilha (importação)'

async function coresParaImport() {
  const rows = await db
    .select({
      id: coresFornecedorFio.id,
      nomeFornecedor: coresFornecedorFio.nomeFornecedor,
    })
    .from(coresFornecedorFio)
    .where(isNull(coresFornecedorFio.deletedAt))
  return rows
}

// Lotes que já estão no banco, pela mesma chave (cor + número normalizado)
// que o parser usa. Só os NÃO excluídos: um lote apagado não é obstáculo
// pra reimportar, e contá-lo faria a prévia acusar duplicata de fantasma.
async function chavesJaExistentes(): Promise<Set<string>> {
  const rows = await db
    .select({
      corFornecedorId: lotesFio.corFornecedorId,
      numeroLote: lotesFio.numeroLote,
      caixas: lotesFio.caixas,
      pesoTotalKg: lotesFio.pesoTotalKg,
    })
    .from(lotesFio)
    .where(isNull(lotesFio.deletedAt))

  const chaves = new Set<string>()
  for (const r of rows) {
    chaves.add(
      chaveDeLote(r.corFornecedorId, r.numeroLote, r.caixas, r.pesoTotalKg),
    )
  }
  return chaves
}

/**
 * Lê o arquivo e diz o que vai acontecer — sem gravar nada.
 *
 * O parsing é puro (`src/lib/fios/importar-csv.ts`); o que se acrescenta
 * aqui é a única coisa que depende do banco: se o lote já existe.
 */
export async function analisarFiosCSVAction(
  texto: string,
): Promise<AnaliseImportFios> {
  await requireAuth()

  // `coresCadastradas`, não `cores`: `cores` aqui é a TABELA do catálogo,
  // importada no topo.
  const [coresCadastradas, existentes] = await Promise.all([
    coresParaImport(),
    chavesJaExistentes(),
  ])

  const r = parseFiosCSV(texto, coresCadastradas)

  const linhas: LinhaAnalisada[] = r.linhas.map((l) => ({
    ...l,
    jaExiste: existentes.has(
      chaveDeLote(l.corFornecedorId, l.numeroLote, l.caixas, l.pesoTotalKg),
    ),
  }))

  const duplicadas = linhas
    .filter((l) => l.jaExiste)
    .map((l) =>
      l.numeroLote
        ? `Linha ${l.linha}: o lote ${l.numeroLote} (${l.corFornecedorNome}) ` +
          `já está cadastrado — ${l.caixas} caixa(s).`
        : `Linha ${l.linha}: já existe um lote sem número de ` +
          `${l.corFornecedorNome} com ${l.caixas} caixa(s) e o mesmo peso.`,
    )

  return {
    linhas,
    ignoradas: r.ignoradas,
    atencoes: r.atencoes,
    duplicadas,
    totais: r.totais,
    totaisSemDuplicadas: calcularTotais(linhas.filter((l) => !l.jaExiste)),
  }
}

/**
 * Grava a planilha. Cada linha vira um lote; linha com RETIRADA vira também
 * uma movimentação de saída, porque QUANTIDADE (KG) na planilha é o peso do
 * SALDO — sem a saída, o estoque nasceria com o total de entrada como se
 * nada tivesse sido consumido.
 *
 * `incluirDuplicadas` decide o que fazer com lote que já existe. O padrão é
 * PULAR: importar agosto duas vezes não pode dobrar o estoque em silêncio.
 *
 * Tudo numa transação: meia planilha importada é pior que nenhuma, porque
 * ninguém sabe onde ela parou.
 */
export async function importarFiosCSVAction(input: {
  texto: string
  dataReferencia: string
  incluirDuplicadas: boolean
}): Promise<
  ActionResult<{ lotes: number; movimentacoes: number; puladas: number }>
> {
  const user = await requireAreaEscrita('estoqueFios')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataReferencia)) {
    return { success: false, error: 'Informe a data de referência da planilha' }
  }

  const analise = await analisarFiosCSVAction(input.texto)
  const aImportar = input.incluirDuplicadas
    ? analise.linhas
    : analise.linhas.filter((l) => !l.jaExiste)
  const puladas = analise.linhas.length - aImportar.length

  if (aImportar.length === 0) {
    return {
      success: false,
      error:
        puladas > 0
          ? `Todas as ${puladas} linha(s) já estão cadastradas. Marque ` +
            '"importar mesmo assim" se forem remessas novas.'
          : 'Nenhuma linha válida no arquivo',
    }
  }

  let movimentacoes = 0

  await db.transaction(async (tx) => {
    for (const l of aImportar) {
      const [lote] = await tx
        .insert(lotesFio)
        .values({
          numeroLote: l.numeroLote,
          corFornecedorId: l.corFornecedorId,
          caixas: l.caixas,
          pesoTotalKg: l.pesoTotalKg,
          dataEntrada: input.dataReferencia,
          // Valor, vendedor e vencimento a planilha não tem. Ficam null —
          // "não sei", que é a verdade — em vez de zero.
          valorTotal: null,
          vendedor: null,
          vencimentoPagamento: null,
          observacao: `Importado da planilha de fios (linha ${l.linha}).`,
        })
        .returning({ id: lotesFio.id })

      if (l.retiradaCaixas > 0 && l.retiradaPesoKg) {
        await tx.insert(movimentacoesFio).values({
          loteId: lote!.id,
          caixas: l.retiradaCaixas,
          pesoKg: l.retiradaPesoKg,
          data: input.dataReferencia,
          motivo: MOTIVO_IMPORT,
          usuarioId: user.id,
        })
        movimentacoes += 1
      }
    }
  })

  revalidatePath('/estoque-fios')
  return {
    success: true,
    data: { lotes: aImportar.length, movimentacoes, puladas },
    message:
      `${aImportar.length} lote(s) importado(s)` +
      (movimentacoes > 0 ? `, ${movimentacoes} com retirada` : '') +
      (puladas > 0 ? ` · ${puladas} já cadastrado(s), pulado(s)` : ''),
  }
}
