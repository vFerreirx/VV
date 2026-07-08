'use server'

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  eventosKanban,
  ordensProducao,
  remessasFull,
  variacoesProduto,
} from '@/lib/db/schema'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'
import {
  criarOpsFullSchema,
  type CriarOpsFullInput,
} from '@/lib/validators/remessas'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export type RemessaFullOpcao = {
  id: string
  canal: 'full_ml' | 'full_shopee'
  dataEnvio: string
  ops: number
}

// "Full ML · 15/07" — rótulo padrão da remessa.
function labelRemessa(canal: string, dataEnvio: string): string {
  const [, m, d] = dataEnvio.split('-')
  const canalLabel =
    CANAL_LABEL_CURTO[canal as keyof typeof CANAL_LABEL_CURTO] ?? canal
  return `${canalLabel} · ${d}/${m}`
}

// Fulls recentes (não excluídos), com contagem de OPs — pro filtro e pro
// dialog de "cadastrar dentro de um Full existente".
export async function listarRemessasFull(): Promise<RemessaFullOpcao[]> {
  await requireArea('ordens')
  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      ops: sql<number>`(
        SELECT COUNT(*)::int FROM ${ordensProducao}
        WHERE ${ordensProducao.remessaFullId} = ${remessasFull.id}
          AND ${ordensProducao.deletedAt} IS NULL
      )`,
    })
    .from(remessasFull)
    .where(isNull(remessasFull.deletedAt))
    .orderBy(desc(remessasFull.dataEnvio))
    .limit(30)

  return rows.map((r) => ({
    id: r.id,
    canal: r.canal as 'full_ml' | 'full_shopee',
    dataEnvio: r.dataEnvio,
    ops: r.ops,
  }))
}

// Cria as OPs dentro de um Full (novo ou existente). Cada item vira uma
// OP programada com o canal do Full e a data de envio como prazo.
export async function criarOpsFullAction(
  input: CriarOpsFullInput,
): Promise<ActionResult<{ ops: number }>> {
  const user = await requireAreaEscrita('ordens')
  const parsed = criarOpsFullSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // Resolve o produto de cada variação escolhida.
  const variacaoIds = [...new Set(data.itens.map((i) => i.variacaoId))]
  const vars = await db
    .select({ id: variacoesProduto.id, produtoId: variacoesProduto.produtoId })
    .from(variacoesProduto)
    .where(inArray(variacoesProduto.id, variacaoIds))
  const produtoDaVariacao = new Map(vars.map((v) => [v.id, v.produtoId]))
  for (const it of data.itens) {
    if (!produtoDaVariacao.has(it.variacaoId)) {
      return { success: false, error: 'Variação não encontrada' }
    }
  }

  const criadas = await db.transaction(async (tx) => {
    // Full existente ou novo.
    let remessa: { id: string; canal: string; dataEnvio: string }
    if (data.remessaId) {
      const [r] = await tx
        .select({
          id: remessasFull.id,
          canal: remessasFull.canal,
          dataEnvio: remessasFull.dataEnvio,
        })
        .from(remessasFull)
        .where(
          and(eq(remessasFull.id, data.remessaId), isNull(remessasFull.deletedAt)),
        )
        .limit(1)
      if (!r) throw new Error('FULL_NAO_ENCONTRADO')
      remessa = r
    } else {
      const [r] = await tx
        .insert(remessasFull)
        .values({ canal: data.canal!, dataEnvio: data.dataEnvio! })
        .returning({
          id: remessasFull.id,
          canal: remessasFull.canal,
          dataEnvio: remessasFull.dataEnvio,
        })
      remessa = r!
    }

    // Data de envio vira o prazo (fim do dia, horário do Brasil).
    const prazo = new Date(`${remessa.dataEnvio}T23:59:59-03:00`)
    const rotulo = labelRemessa(remessa.canal, remessa.dataEnvio)

    for (const it of data.itens) {
      const [op] = await tx
        .insert(ordensProducao)
        .values({
          numero: '',
          produtoId: produtoDaVariacao.get(it.variacaoId)!,
          variacaoId: it.variacaoId,
          quantidade: it.quantidade,
          canalDestino: remessa.canal as 'full_ml' | 'full_shopee',
          prioridade: data.prioridade,
          status: 'programado',
          dataPrevistaFim: prazo,
          remessaFullId: remessa.id,
          criadoPor: user.id,
          observacoes: `Remessa ${rotulo}`,
        })
        .returning({ id: ordensProducao.id })

      await tx.insert(eventosKanban).values({
        ordemId: op!.id,
        statusAnterior: null,
        statusNovo: 'programado',
        usuarioId: user.id,
        observacao: `OP criada no Full ${rotulo}`,
      })
    }
    return data.itens.length
  }).catch((e) => {
    if (e instanceof Error && e.message === 'FULL_NAO_ENCONTRADO') return -1
    throw e
  })

  if (criadas === -1) return { success: false, error: 'Full não encontrado' }

  revalidatePath('/ordens')
  revalidatePath('/producao')
  return {
    success: true,
    data: { ops: criadas },
    message: `${criadas} OP${criadas > 1 ? 's' : ''} criada${criadas > 1 ? 's' : ''} no Full`,
  }
}
