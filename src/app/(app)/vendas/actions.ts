'use server'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireArea, requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { vendas, vendasMarketplace } from '@/lib/db/schema'
import {
  marketplaceDaConta,
  vendaDiaSchema,
  type VendaDiaInput,
} from '@/lib/validators/vendas'
import { parseVendasCSV, type ResultadoImport } from '@/lib/vendas/importar-csv'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type VendaContaLinha = {
  conta: string
  quantidade: number
  faturamento: string | null
}

export type VendaDia = {
  id: string
  data: string
  quantidade: number
  faturamento: string | null
  observacao: string | null
  contas: VendaContaLinha[]
}

// -----------------------------------------------------------------
// Venda de um dia específico (com detalhamento por conta)
// -----------------------------------------------------------------

export async function obterVendaDoDia(data: string): Promise<VendaDia | null> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])
  const [row] = await db
    .select({
      id: vendas.id,
      data: vendas.data,
      quantidade: vendas.quantidade,
      faturamento: vendas.faturamento,
      observacao: vendas.observacao,
    })
    .from(vendas)
    .where(and(eq(vendas.data, data), isNull(vendas.deletedAt)))
    .limit(1)
  if (!row) return null

  const contas = await db
    .select({
      conta: vendasMarketplace.conta,
      quantidade: vendasMarketplace.quantidade,
      faturamento: vendasMarketplace.faturamento,
    })
    .from(vendasMarketplace)
    .where(eq(vendasMarketplace.vendaId, row.id))

  return { ...row, contas }
}

// Últimos N dias com venda registrada (pra lista de referência).
export async function listarVendasRecentes(limit = 14): Promise<VendaDia[]> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])
  const linhas = await db
    .select({
      id: vendas.id,
      data: vendas.data,
      quantidade: vendas.quantidade,
      faturamento: vendas.faturamento,
      observacao: vendas.observacao,
    })
    .from(vendas)
    .where(isNull(vendas.deletedAt))
    .orderBy(desc(vendas.data))
    .limit(limit)
  return linhas.map((l) => ({ ...l, contas: [] }))
}

// -----------------------------------------------------------------
// Salvar (upsert por dia) / excluir
// -----------------------------------------------------------------

export async function salvarVendaDiaAction(
  input: VendaDiaInput,
): Promise<ActionResult> {
  const user = await requireRole(['admin', 'gerente_producao', 'vendas'])

  const parsed = vendaDiaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const d = parsed.data

  // Só guarda contas com alguma venda (quantidade ou faturamento).
  const contas = d.contas
    .map((c) => {
      const marketplace = marketplaceDaConta(c.conta)
      return marketplace
        ? {
            conta: c.conta,
            marketplace,
            quantidade: c.quantidade,
            faturamento: c.faturamento ?? null,
          }
        : null
    })
    .filter(
      (c): c is NonNullable<typeof c> =>
        c !== null && (c.quantidade > 0 || c.faturamento !== null),
    )

  // Totais do dia = soma das contas.
  const totalQuantidade = contas.reduce((s, c) => s + c.quantidade, 0)
  const somaFaturamento = contas.reduce((s, c) => s + Number(c.faturamento ?? 0), 0)
  const temFaturamento = contas.some((c) => c.faturamento !== null)
  const totalFaturamento = temFaturamento ? somaFaturamento.toFixed(2) : null

  await db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: vendas.id })
      .from(vendas)
      .where(and(eq(vendas.data, d.data), isNull(vendas.deletedAt)))
      .limit(1)

    let vendaId: string
    if (existente) {
      vendaId = existente.id
      await tx
        .update(vendas)
        .set({
          quantidade: totalQuantidade,
          faturamento: totalFaturamento,
          observacao: d.observacao ?? null,
          usuarioId: user.id,
        })
        .where(eq(vendas.id, vendaId))
      await tx
        .delete(vendasMarketplace)
        .where(eq(vendasMarketplace.vendaId, vendaId))
    } else {
      const [nova] = await tx
        .insert(vendas)
        .values({
          data: d.data,
          quantidade: totalQuantidade,
          faturamento: totalFaturamento,
          observacao: d.observacao ?? null,
          usuarioId: user.id,
        })
        .returning({ id: vendas.id })
      vendaId = nova.id
    }

    if (contas.length > 0) {
      await tx.insert(vendasMarketplace).values(
        contas.map((c) => ({
          vendaId,
          marketplace: c.marketplace,
          conta: c.conta,
          quantidade: c.quantidade,
          faturamento: c.faturamento,
        })),
      )
    }
  })

  revalidatePath('/vendas')
  return { success: true, message: 'Vendas do dia salvas' }
}

export async function excluirVendaDiaAction(
  id: string,
): Promise<ActionResult> {
  await requireRole(['admin', 'gerente_producao', 'vendas'])
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  await db
    .update(vendas)
    .set({ deletedAt: new Date() })
    .where(and(eq(vendas.id, id), isNull(vendas.deletedAt)))

  revalidatePath('/vendas')
  return { success: true, message: 'Registro removido' }
}

// -----------------------------------------------------------------
// Importar CSV (grid de vendas por conta de marketplace)
// -----------------------------------------------------------------

// Só analisa (preview) — não grava nada.
export async function analisarVendasCSVAction(
  texto: string,
): Promise<ResultadoImport> {
  await requireArea('vendas')
  return parseVendasCSV(texto)
}

// Importa de fato: cada dia do CSV é gravado (upsert), substituindo o
// registro daquele dia pelo conteúdo do arquivo.
export async function importarVendasCSVAction(
  texto: string,
): Promise<ActionResult<{ dias: number; contas: number }>> {
  const user = await requireArea('vendas')
  if (!podeEscrever(await nivelDaAreaPara(user.role, 'vendas'))) {
    return { success: false, error: 'Sem permissão pra importar vendas' }
  }

  const { dias } = parseVendasCSV(texto)
  if (dias.length === 0) {
    return { success: false, error: 'Nenhuma venda válida no arquivo' }
  }

  let totalContas = 0

  await db.transaction(async (tx) => {
    for (const dia of dias) {
      const contas = dia.contas
        .map((c) => {
          const marketplace = marketplaceDaConta(c.conta)
          return marketplace
            ? {
                conta: c.conta,
                marketplace,
                quantidade: c.quantidade,
                faturamento: c.faturamento,
              }
            : null
        })
        // Mantém todas as contas reconhecidas, inclusive zeradas (ex.:
        // TikTok/Temu recém-começados normalmente vêm sem valor).
        .filter((c): c is NonNullable<typeof c> => c !== null)

      if (contas.length === 0) continue
      totalContas += contas.length

      const totalQtd = contas.reduce((s, c) => s + c.quantidade, 0)
      const temFat = contas.some((c) => Number(c.faturamento) > 0)
      const totalFat = temFat
        ? contas.reduce((s, c) => s + Number(c.faturamento), 0).toFixed(2)
        : null

      const [existente] = await tx
        .select({ id: vendas.id })
        .from(vendas)
        .where(and(eq(vendas.data, dia.data), isNull(vendas.deletedAt)))
        .limit(1)

      let vendaId: string
      if (existente) {
        vendaId = existente.id
        await tx
          .update(vendas)
          .set({
            quantidade: totalQtd,
            faturamento: totalFat,
            usuarioId: user.id,
          })
          .where(eq(vendas.id, vendaId))
        await tx
          .delete(vendasMarketplace)
          .where(eq(vendasMarketplace.vendaId, vendaId))
      } else {
        const [nova] = await tx
          .insert(vendas)
          .values({
            data: dia.data,
            quantidade: totalQtd,
            faturamento: totalFat,
            usuarioId: user.id,
          })
          .returning({ id: vendas.id })
        vendaId = nova.id
      }

      await tx.insert(vendasMarketplace).values(
        contas.map((c) => ({
          vendaId,
          marketplace: c.marketplace,
          conta: c.conta,
          quantidade: c.quantidade,
          faturamento: c.faturamento,
        })),
      )
    }
  })

  revalidatePath('/vendas')
  return {
    success: true,
    data: { dias: dias.length, contas: totalContas },
    message: `${dias.length} dia(s) importado(s)`,
  }
}
