'use server'

import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import { compradores, type Comprador } from '@/lib/db/schema'
import {
  compradorSchema,
  type CompradorInput,
} from '@/lib/validators/compradores'
import { formatarDocumento, soDigitos } from '@/lib/validators/documento'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarCompradores(): Promise<Comprador[]> {
  await requireArea('compradores')
  return db
    .select()
    .from(compradores)
    .where(isNull(compradores.deletedAt))
    .orderBy(asc(compradores.nome))
}

// Só o necessário pro select do orçamento — não carrega endereço/documento
// pra tela de orçamento, que não precisa deles.
export type CompradorOpcao = { id: string; nome: string }

export async function listarCompradoresParaSelecao(): Promise<
  CompradorOpcao[]
> {
  await requireArea('compradores')
  return db
    .select({ id: compradores.id, nome: compradores.nome })
    .from(compradores)
    .where(isNull(compradores.deletedAt))
    .orderBy(asc(compradores.nome))
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarCompradorAction(
  input: CompradorInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('compradores')

  const parsed = compradorSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  if (data.documento) {
    const existing = await db
      .select({ id: compradores.id, nome: compradores.nome })
      .from(compradores)
      .where(
        and(
          eq(compradores.documento, data.documento),
          isNull(compradores.deletedAt),
        ),
      )
      .limit(1)
    if (existing.length > 0) {
      return {
        success: false,
        error: `${formatarDocumento(data.documento)} já está cadastrado em "${existing[0]!.nome}"`,
      }
    }
  }

  let inserted: { id: string } | undefined
  try {
    ;[inserted] = await db
      .insert(compradores)
      .values(data)
      .returning({ id: compradores.id })
  } catch (err) {
    // Corrida entre a checagem acima e o INSERT (duplo-clique/reenvio) bate
    // no índice único parcial do documento. Vira erro amigável, não 500.
    if (isUniqueViolation(err)) {
      return {
        success: false,
        error: `${formatarDocumento(data.documento ?? '')} já está cadastrado`,
      }
    }
    throw err
  }

  revalidatePath('/compradores')
  revalidatePath('/pedidos')
  return {
    success: true,
    data: { id: inserted!.id },
    message: 'Comprador cadastrado',
  }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarCompradorAction(
  id: string,
  input: CompradorInput,
): Promise<ActionResult> {
  await requireAreaEscrita('compradores')

  const parsed = compradorSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: compradores.id })
    .from(compradores)
    .where(and(eq(compradores.id, id), isNull(compradores.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Comprador não encontrado' }

  // Documento único entre OUTROS compradores ativos.
  if (data.documento) {
    const conflicting = await db
      .select({ id: compradores.id, nome: compradores.nome })
      .from(compradores)
      .where(
        and(
          eq(compradores.documento, data.documento),
          isNull(compradores.deletedAt),
          ne(compradores.id, id),
        ),
      )
      .limit(1)
    if (conflicting.length > 0) {
      return {
        success: false,
        error: `${formatarDocumento(data.documento)} já está cadastrado em "${conflicting[0]!.nome}"`,
      }
    }
  }

  try {
    await db.update(compradores).set(data).where(eq(compradores.id, id))
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        success: false,
        error: `${formatarDocumento(data.documento ?? '')} já está cadastrado`,
      }
    }
    throw err
  }

  revalidatePath('/compradores')
  revalidatePath('/pedidos')
  return { success: true, message: 'Comprador atualizado' }
}

// -----------------------------------------------------------------
// Soft delete
// -----------------------------------------------------------------

export async function excluirCompradorAction(
  id: string,
): Promise<ActionResult> {
  await requireAreaEscrita('compradores')

  const [atual] = await db
    .select({ id: compradores.id })
    .from(compradores)
    .where(and(eq(compradores.id, id), isNull(compradores.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Comprador não encontrado' }

  // Soft delete. Os orçamentos que apontavam pra ele continuam abrindo: o
  // nome impresso vive em `orcamentos.cliente` (texto) e o compradorId só
  // deixa de resolver.
  await db
    .update(compradores)
    .set({ deletedAt: new Date() })
    .where(eq(compradores.id, id))

  revalidatePath('/compradores')
  revalidatePath('/pedidos')
  return { success: true, message: 'Comprador excluído' }
}

// -----------------------------------------------------------------
// CEP (ViaCEP)
// -----------------------------------------------------------------

export type EnderecoCep = {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

// Busca no ViaCEP por SERVER ACTION (não fetch do cliente): dá pra impor
// timeout, os três casos ruins (CEP inexistente, fora do ar, resposta
// estranha) viram um ActionResult só, e só o servidor precisa alcançar o
// serviço — tablet/celular em rede restrita continua funcionando.
//
// Nada aqui é obrigatório: em qualquer falha a tela segue com digitação
// manual do endereço.
export async function buscarCepAction(
  cepBruto: string,
): Promise<ActionResult<EnderecoCep>> {
  await requireArea('compradores')

  const cep = soDigitos(cepBruto)
  if (cep.length !== 8) {
    return { success: false, error: 'CEP deve ter 8 dígitos' }
  }

  let res: Response
  try {
    res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
  } catch {
    // Timeout, DNS, sem internet — tudo cai aqui.
    return {
      success: false,
      error: 'Não deu pra consultar o CEP agora. Digite o endereço à mão.',
    }
  }

  if (!res.ok) {
    return {
      success: false,
      error: 'Consulta de CEP indisponível. Digite o endereço à mão.',
    }
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return {
      success: false,
      error: 'Resposta inesperada na consulta de CEP. Digite à mão.',
    }
  }

  const d = json as Record<string, unknown>
  // CEP que não existe: o ViaCEP responde 200 com { "erro": true }.
  if (d.erro) return { success: false, error: 'CEP não encontrado' }

  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    success: true,
    data: {
      logradouro: texto(d.logradouro),
      bairro: texto(d.bairro),
      cidade: texto(d.localidade),
      uf: texto(d.uf).toUpperCase(),
    },
  }
}
