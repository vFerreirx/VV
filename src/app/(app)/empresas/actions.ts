'use server'

import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireAreaEscrita, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { contasMarketplace, empresas, type Empresa } from '@/lib/db/schema'
import { empresaSchema, type EmpresaInput } from '@/lib/validators/empresas'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export type EmpresaComUso = Empresa & {
  // Quantas contas de marketplace pertencem a esta empresa — a tela usa
  // isso pra avisar antes de excluir.
  contas: number
}

// Só o que os documentos impressos precisam. Fica separado do resto pra
// deixar claro o que atravessa a fronteira server → client de impressão.
export type EmpresaDoDocumento = {
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarEmpresas(): Promise<EmpresaComUso[]> {
  await requireAuth()
  const rows = await db
    .select({
      id: empresas.id,
      razaoSocial: empresas.razaoSocial,
      nomeFantasia: empresas.nomeFantasia,
      cnpj: empresas.cnpj,
      cep: empresas.cep,
      logradouro: empresas.logradouro,
      numero: empresas.numero,
      complemento: empresas.complemento,
      bairro: empresas.bairro,
      cidade: empresas.cidade,
      uf: empresas.uf,
      principal: empresas.principal,
      createdAt: empresas.createdAt,
      updatedAt: empresas.updatedAt,
      deletedAt: empresas.deletedAt,
      // "empresas"."id" escrito à mão: num select de tabela única o Drizzle
      // não qualifica as colunas, e aí o `id` da subconsulta se resolveria
      // como contas_marketplace.id — a contagem daria sempre zero.
      contas: sql<number>`(
        SELECT count(*)::int FROM ${contasMarketplace} c
        WHERE c.empresa_id = "empresas"."id"
          AND c.deleted_at IS NULL
      )`,
    })
    .from(empresas)
    .where(isNull(empresas.deletedAt))
    // A principal primeiro — é a que responde "quem sai no papel?".
    .orderBy(desc(empresas.principal), asc(empresas.razaoSocial))

  return rows as EmpresaComUso[]
}

/**
 * O endereço da empresa PRINCIPAL — a origem de qualquer cotação de frete.
 * Devolve `null` quando não há principal ou quando ela ainda não tem CEP,
 * que é o caso em que a cotação não pode nem começar.
 */
export async function obterOrigemFrete(): Promise<{
  cep: string
  cidade: string | null
  uf: string | null
  nome: string
} | null> {
  await requireAuth()
  const [e] = await db
    .select({
      cep: empresas.cep,
      cidade: empresas.cidade,
      uf: empresas.uf,
      razaoSocial: empresas.razaoSocial,
      nomeFantasia: empresas.nomeFantasia,
    })
    .from(empresas)
    .where(and(eq(empresas.principal, true), isNull(empresas.deletedAt)))
    .limit(1)
  if (!e?.cep) return null
  return {
    cep: e.cep,
    cidade: e.cidade,
    uf: e.uf,
    nome: e.nomeFantasia ?? e.razaoSocial,
  }
}

// Alimenta o seletor de empresa no cadastro de conta de marketplace.
export async function listarEmpresasParaSelecao(): Promise<Empresa[]> {
  await requireAuth()
  return db
    .select()
    .from(empresas)
    .where(isNull(empresas.deletedAt))
    .orderBy(asc(empresas.razaoSocial))
}

// A empresa que identifica os documentos impressos. Devolve null quando
// ainda não há nenhuma cadastrada ou nenhuma marcada — o documento tem que
// continuar saindo nesse caso (ver EMPRESA_FALLBACK no componente).
export async function obterEmpresaPrincipal(): Promise<EmpresaDoDocumento | null> {
  await requireAuth()
  const [row] = await db
    .select({
      razaoSocial: empresas.razaoSocial,
      nomeFantasia: empresas.nomeFantasia,
      cnpj: empresas.cnpj,
    })
    .from(empresas)
    .where(and(eq(empresas.principal, true), isNull(empresas.deletedAt)))
    .limit(1)

  return row ?? null
}

// -----------------------------------------------------------------
// Criar / atualizar / excluir
// -----------------------------------------------------------------

// O índice único diz qual regra estourou; sem isso os dois casos virariam a
// mesma mensagem genérica.
function nomeDaConstraint(err: unknown): string | undefined {
  const e = err as { constraint_name?: string; cause?: { constraint_name?: string } } | null
  return e?.constraint_name ?? e?.cause?.constraint_name
}

function erroDeIndice(err: unknown): string | null {
  const c = nomeDaConstraint(err)
  if (c === 'empresas_cnpj_uidx') {
    return 'Já existe uma empresa com esse CNPJ'
  }
  if (c === 'empresas_principal_uidx') {
    return 'Outra empresa foi marcada como principal ao mesmo tempo — abra de novo e tente'
  }
  return null
}

// Marcar esta como principal desmarca a anterior. Roda DENTRO da transação
// de quem chama, sempre antes do insert/update que marca a nova — o índice
// único não deixa as duas coexistirem nem por um instante.
async function desmarcarOutraPrincipal(tx: Tx, exceto?: string): Promise<void> {
  await tx
    .update(empresas)
    .set({ principal: false })
    .where(
      and(
        eq(empresas.principal, true),
        isNull(empresas.deletedAt),
        exceto ? ne(empresas.id, exceto) : undefined,
      ),
    )
}

async function existePrincipal(tx: Tx): Promise<boolean> {
  const [row] = await tx
    .select({ id: empresas.id })
    .from(empresas)
    .where(and(eq(empresas.principal, true), isNull(empresas.deletedAt)))
    .limit(1)
  return row !== undefined
}

export async function criarEmpresaAction(
  input: EmpresaInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('empresas')

  const parsed = empresaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  let inserted: { id: string } | undefined
  try {
    inserted = await db.transaction(async (tx) => {
      // A primeira empresa nasce principal mesmo sem marcar: senão os
      // documentos ficariam no texto neutro só porque ninguém viu a chave.
      const principal = data.principal || !(await existePrincipal(tx))
      if (principal) await desmarcarOutraPrincipal(tx)

      const [row] = await tx
        .insert(empresas)
        .values({
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia,
          cnpj: data.cnpj,
          cep: data.cep,
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento,
          bairro: data.bairro,
          cidade: data.cidade,
          uf: data.uf,
          principal,
        })
        .returning({ id: empresas.id })
      return row!
    })
  } catch (err) {
    const amigavel = erroDeIndice(err)
    if (amigavel) return { success: false, error: amigavel }
    throw err
  }

  revalidatePath('/empresas')
  revalidatePath('/contas-marketplace')
  revalidateDocumentos()
  return {
    success: true,
    data: { id: inserted.id },
    message: 'Empresa cadastrada',
  }
}

export async function atualizarEmpresaAction(
  id: string,
  input: EmpresaInput,
): Promise<ActionResult> {
  await requireAreaEscrita('empresas')

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const parsed = empresaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: empresas.id, principal: empresas.principal })
    .from(empresas)
    .where(and(eq(empresas.id, id), isNull(empresas.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Empresa não encontrada' }

  try {
    await db.transaction(async (tx) => {
      // Desmarcar a única principal deixaria o sistema sem nenhuma e os
      // documentos no texto neutro — trocar de principal é marcar outra.
      const principal = data.principal || atual.principal
      if (principal) await desmarcarOutraPrincipal(tx, id)

      await tx
        .update(empresas)
        .set({
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia,
          cnpj: data.cnpj,
          cep: data.cep,
          logradouro: data.logradouro,
          numero: data.numero,
          complemento: data.complemento,
          bairro: data.bairro,
          cidade: data.cidade,
          uf: data.uf,
          principal,
        })
        .where(eq(empresas.id, id))
    })
  } catch (err) {
    const amigavel = erroDeIndice(err)
    if (amigavel) return { success: false, error: amigavel }
    throw err
  }

  revalidatePath('/empresas')
  revalidatePath('/contas-marketplace')
  revalidateDocumentos()
  return { success: true, message: 'Empresa atualizada' }
}

// Soft delete. As contas que apontam pra ela NÃO são tocadas — o vínculo
// continua e a tela de contas segue mostrando o nome, igual ao que a
// remessa faz com a conta excluída.
//
// Excluir a principal é permitido: se fosse bloqueado, quem tem uma empresa
// só ficaria preso. Os documentos voltam ao texto neutro até alguém marcar
// outra — a tela avisa isso antes.
export async function excluirEmpresaAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('empresas')

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await db
    .select({ id: empresas.id })
    .from(empresas)
    .where(and(eq(empresas.id, id), isNull(empresas.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Empresa não encontrada' }

  // principal: false junto do deletedAt — a linha excluída já sai do índice
  // parcial, mas deixar a marca ligada faria a lista mentir se um dia ela
  // voltar.
  await db
    .update(empresas)
    .set({ deletedAt: new Date(), principal: false })
    .where(eq(empresas.id, id))

  revalidatePath('/empresas')
  revalidatePath('/contas-marketplace')
  revalidateDocumentos()
  return { success: true, message: 'Empresa excluída' }
}

// Os três documentos leem a empresa principal no server component, então
// mudar quem é a principal (ou os dados dela) tem que furar o cache das
// rotas de pedido.
function revalidateDocumentos(): void {
  revalidatePath('/pedidos/[id]', 'page')
  revalidatePath('/pedidos/[id]/separacao', 'page')
  revalidatePath('/pedidos/[id]/romaneio', 'page')
}
