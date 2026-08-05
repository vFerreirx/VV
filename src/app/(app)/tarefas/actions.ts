'use server'

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { contasMarketplace, tarefas, users, type Tarefa } from '@/lib/db/schema'
import { tarefaSchema, type TarefaInput } from '@/lib/validators/tarefas'

// Tarefas da administração. TODAS as actions daqui são admin-only via
// requireRole — a área `tarefas` não é editável em /permissoes, então as
// duas camadas dizem a mesma coisa e continuam dizendo.

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export type TarefaComContexto = Tarefa & {
  // Nome da conta de marketplace, quando a tarefa é de uma conta.
  contaNome: string | null
  // Quem marcou como concluída. São vários admins — sem isso ninguém sabe
  // quem fez.
  concluidaPorNome: string | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LIMITE_CONCLUIDAS = 50

const CAMPOS = {
  id: tarefas.id,
  titulo: tarefas.titulo,
  descricao: tarefas.descricao,
  prazo: tarefas.prazo,
  contaId: tarefas.contaId,
  concluidaEm: tarefas.concluidaEm,
  concluidaPor: tarefas.concluidaPor,
  criadoPor: tarefas.criadoPor,
  createdAt: tarefas.createdAt,
  updatedAt: tarefas.updatedAt,
  deletedAt: tarefas.deletedAt,
  contaNome: contasMarketplace.nome,
  concluidaPorNome: users.nome,
}

// Pendentes: prazo mais próximo primeiro (as vencidas caem naturalmente no
// topo, porque a data é menor), sem prazo por último, e entre as sem prazo
// a mais nova primeiro.
const ORDEM_PENDENTES = [
  sql`${tarefas.prazo} ASC NULLS LAST`,
  desc(tarefas.createdAt),
]

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export type ListaTarefas = {
  pendentes: TarefaComContexto[]
  concluidas: TarefaComContexto[]
}

export async function listarTarefas(): Promise<ListaTarefas> {
  await requireRole(['admin'])

  // leftJoin nos dois: tarefa sem conta e tarefa ainda não concluída
  // precisam continuar aparecendo.
  const base = () =>
    db
      .select(CAMPOS)
      .from(tarefas)
      .leftJoin(contasMarketplace, eq(contasMarketplace.id, tarefas.contaId))
      .leftJoin(users, eq(users.id, tarefas.concluidaPor))

  const [pendentes, concluidas] = await Promise.all([
    base()
      .where(and(isNull(tarefas.deletedAt), isNull(tarefas.concluidaEm)))
      .orderBy(...ORDEM_PENDENTES),
    base()
      .where(and(isNull(tarefas.deletedAt), isNotNull(tarefas.concluidaEm)))
      .orderBy(desc(tarefas.concluidaEm))
      .limit(LIMITE_CONCLUIDAS),
  ])

  return { pendentes, concluidas }
}

// Bloco do painel inicial: só as pendentes mais urgentes.
export async function listarTarefasDoPainel(
  limite = 5,
): Promise<TarefaComContexto[]> {
  await requireRole(['admin'])

  return db
    .select(CAMPOS)
    .from(tarefas)
    .leftJoin(contasMarketplace, eq(contasMarketplace.id, tarefas.contaId))
    .leftJoin(users, eq(users.id, tarefas.concluidaPor))
    .where(and(isNull(tarefas.deletedAt), isNull(tarefas.concluidaEm)))
    .orderBy(...ORDEM_PENDENTES)
    .limit(limite)
}

// Quantas pendentes existem no total — o painel mostra só 5 e precisa dizer
// que há mais.
export async function contarTarefasPendentes(): Promise<number> {
  await requireRole(['admin'])

  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tarefas)
    .where(and(isNull(tarefas.deletedAt), isNull(tarefas.concluidaEm)))
  return linha?.total ?? 0
}

// -----------------------------------------------------------------
// Criar / atualizar / excluir
// -----------------------------------------------------------------

// A conta pode ter sido excluída entre carregar a tela e salvar.
async function contaValida(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contasMarketplace.id })
    .from(contasMarketplace)
    .where(
      and(eq(contasMarketplace.id, id), isNull(contasMarketplace.deletedAt)),
    )
    .limit(1)
  return row !== undefined
}

export async function criarTarefaAction(
  input: TarefaInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(['admin'])

  const parsed = tarefaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  if (data.contaId && !(await contaValida(data.contaId))) {
    return { success: false, error: 'Conta de marketplace inválida' }
  }

  const [inserted] = await db
    .insert(tarefas)
    .values({
      titulo: data.titulo,
      descricao: data.descricao,
      prazo: data.prazo,
      contaId: data.contaId,
      criadoPor: user.id,
    })
    .returning({ id: tarefas.id })

  revalidatePath('/tarefas')
  revalidatePath('/dashboard')
  return { success: true, data: { id: inserted!.id }, message: 'Tarefa criada' }
}

export async function atualizarTarefaAction(
  id: string,
  input: TarefaInput,
): Promise<ActionResult> {
  await requireRole(['admin'])

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const parsed = tarefaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  if (data.contaId && !(await contaValida(data.contaId))) {
    return { success: false, error: 'Conta de marketplace inválida' }
  }

  const [atual] = await db
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.id, id), isNull(tarefas.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Tarefa não encontrada' }

  await db
    .update(tarefas)
    .set({
      titulo: data.titulo,
      descricao: data.descricao,
      prazo: data.prazo,
      contaId: data.contaId,
    })
    .where(eq(tarefas.id, id))

  revalidatePath('/tarefas')
  revalidatePath('/dashboard')
  return { success: true, message: 'Tarefa atualizada' }
}

// Concluir e reabrir são a MESMA operação com sinal trocado: as duas
// colunas do estado andam juntas (o CHECK do banco não aceita metade).
async function definirConclusao(
  id: string,
  quem: string | null,
): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await db
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.id, id), isNull(tarefas.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Tarefa não encontrada' }

  await db
    .update(tarefas)
    .set({
      concluidaEm: quem === null ? null : new Date(),
      concluidaPor: quem,
    })
    .where(eq(tarefas.id, id))

  revalidatePath('/tarefas')
  revalidatePath('/dashboard')
  return {
    success: true,
    message: quem === null ? 'Tarefa reaberta' : 'Tarefa concluída',
  }
}

export async function concluirTarefaAction(id: string): Promise<ActionResult> {
  const user = await requireRole(['admin'])
  return definirConclusao(id, user.id)
}

export async function reabrirTarefaAction(id: string): Promise<ActionResult> {
  await requireRole(['admin'])
  return definirConclusao(id, null)
}

// Soft delete — a tarefa vai pra lixeira e dá pra restaurar de lá.
export async function excluirTarefaAction(id: string): Promise<ActionResult> {
  await requireRole(['admin'])

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await db
    .select({ id: tarefas.id })
    .from(tarefas)
    .where(and(eq(tarefas.id, id), isNull(tarefas.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Tarefa não encontrada' }

  await db
    .update(tarefas)
    .set({ deletedAt: new Date() })
    .where(eq(tarefas.id, id))

  revalidatePath('/tarefas')
  revalidatePath('/dashboard')
  revalidatePath('/lixeira')
  return { success: true, message: 'Tarefa excluída' }
}
