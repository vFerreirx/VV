'use server'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { gravarEstacaoDoAparelho } from '@/lib/auth/estacao-do-aparelho'
import { getCurrentUser } from '@/lib/auth/get-user'
import { isManager } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { estacoes, maquinas } from '@/lib/db/schema'

export type ActionResult = { success: true } | { success: false; error: string }

export type EstacaoParaAparelho = {
  id: string
  nome: string
  cor: string | null
  /**
   * Os NÚMEROS das máquinas, em ordem, pro gerente conferir que é o grupo
   * perto deste tablet. A tela diz "Máquinas 1, 2, 3 e 7" (`nomesDasMaquinas`).
   */
  maquinas: number[]
}

/** As estações vivas, com os números das máquinas. Só admin e gerente. */
export async function listarEstacoesParaAparelho(): Promise<
  EstacaoParaAparelho[]
> {
  const user = await getCurrentUser()
  if (!user || !isManager(user.role)) return []

  const [rows, maqs] = await Promise.all([
    db
      .select({ id: estacoes.id, nome: estacoes.nome, cor: estacoes.cor })
      .from(estacoes)
      .where(isNull(estacoes.deletedAt)),
    db
      .select({ numero: maquinas.numero, estacaoId: maquinas.estacaoId })
      .from(maquinas)
      .where(isNull(maquinas.deletedAt))
      .orderBy(asc(maquinas.numero)),
  ])
  return rows
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
    .map((e) => ({
      ...e,
      maquinas: maqs.filter((m) => m.estacaoId === e.id).map((m) => m.numero),
    }))
}

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Define a estação DESTE aparelho (null = nenhuma). Grava um cookie no
 * próprio tablet — ver src/lib/auth/estacao-do-aparelho.ts.
 *
 * ⚠️ SÓ ADMIN E GERENTE, pelo cargo da SESSÃO NORMAL de login, e fixo — não
 * passa por /permissoes. O gerente entra no tablet com a senha dele, escolhe
 * a estação e sai; o cookie fica. Não existe caminho no painel do operador
 * que peça a senha do gerente: seria um lugar pra ficar tentando a senha dele
 * no chão de fábrica, por uma coisa que acontece uma vez por tablet.
 *
 * Não é permissão de nada: a estação só organiza a tela do tablet.
 */
export async function definirEstacaoDoAparelhoAction(
  estacaoId: string | null,
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user || !isManager(user.role)) {
    return {
      success: false,
      error: 'Só o gerente ou o admin define a estação do tablet',
    }
  }

  if (estacaoId !== null) {
    if (!uuidRe.test(estacaoId)) {
      return { success: false, error: 'Estação inválida' }
    }
    const [viva] = await db
      .select({ id: estacoes.id })
      .from(estacoes)
      .where(and(eq(estacoes.id, estacaoId), isNull(estacoes.deletedAt)))
      .limit(1)
    if (!viva) return { success: false, error: 'Estação não encontrada' }
  }

  await gravarEstacaoDoAparelho(estacaoId)
  revalidatePath('/este-aparelho')
  revalidatePath('/producao')
  return { success: true }
}
