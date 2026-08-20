'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { obterCatalogoDeSeparacao, obterOrcamento } from './actions'
import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { orcamentoFaltantes } from '@/lib/db/schema'
import { montarLinhasSeparacao } from '@/lib/separacao'

// ─────────────────────────────────────────────────────────────────────────
// ITENS FALTANTES — o que a separação não achou e a fábrica precisa produzir.
//
// A marcação vive na LINHA DA VIA DE SEPARAÇÃO, não no item do pedido: o que
// falta é uma capa específica de dentro do kit, não o kit inteiro. A chave que
// liga uma coisa na outra é montada por src/lib/separacao.ts — leia o bloco
// "A CHAVE DA LINHA" lá antes de mexer aqui.
//
// ESCOPO: isto só REGISTRA. Não gera OP, não mexe em estoque e não cria
// pedido nenhum — ficou de fora de propósito.
// ─────────────────────────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

/** Uma marcação como ela vai e volta da tela. */
export type Faltante = {
  chave: string
  descricao: string
  quantidade: number
}

export async function listarFaltantes(
  orcamentoId: string,
): Promise<Faltante[]> {
  await requireArea('vendas')
  return db
    .select({
      chave: orcamentoFaltantes.chave,
      descricao: orcamentoFaltantes.descricao,
      quantidade: orcamentoFaltantes.quantidade,
    })
    .from(orcamentoFaltantes)
    .where(eq(orcamentoFaltantes.orcamentoId, orcamentoId))
}

// O TOTAL POR PEDIDO da listagem não mora aqui: ele é agregado junto com a
// contagem de itens dentro de `listarOrcamentos` (./actions.ts). Este módulo
// já importa daquele — precisa da via de separação pra conferir as chaves —,
// então a volta fecharia um ciclo entre dois 'use server'.

/**
 * Grava as marcações do pedido inteiro de uma vez — a tela manda a via
 * completa e esta action substitui o que havia, igual `atualizarOrcamentoAction`
 * faz com os itens. Substituir é o que permite ZERAR uma linha: "não falta
 * mais nada aqui" é a ausência da linha, não um zero guardado.
 *
 * AS LINHAS SÃO RECONFERIDAS AQUI, contra a via montada agora no servidor:
 * chave que não existe no pedido é recusada (marcação órfã não entra), e
 * quantidade acima do que a linha tem é aparada — não dá pra faltar 5 de uma
 * linha de 3. A tela já impede as duas coisas; isto é a garantia de que o
 * banco não depende dela pra ficar coerente.
 */
export async function salvarFaltantesAction(
  orcamentoId: string,
  marcacoes: Faltante[],
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')

  const [orcamento, catalogo] = await Promise.all([
    obterOrcamento(orcamentoId),
    obterCatalogoDeSeparacao(),
  ])
  if (!orcamento) return { success: false, error: 'Pedido não encontrado' }

  const linhas = montarLinhasSeparacao(orcamento.itens, catalogo)
  const porChave = new Map(linhas.map((l) => [l.chave, l]))

  const validas: Faltante[] = []
  for (const m of marcacoes) {
    const linha = porChave.get(m.chave)
    if (!linha) continue
    const qtd = Math.min(
      Math.max(0, Math.floor(Number(m.quantidade) || 0)),
      linha.quantidade,
    )
    if (qtd > 0) {
      validas.push({ chave: m.chave, descricao: linha.descricao, quantidade: qtd })
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(orcamentoFaltantes)
      .where(eq(orcamentoFaltantes.orcamentoId, orcamentoId))
    if (validas.length > 0) {
      await tx
        .insert(orcamentoFaltantes)
        .values(validas.map((v) => ({ ...v, orcamentoId })))
    }
  })

  revalidatePath('/pedidos')
  revalidatePath(`/pedidos/${orcamentoId}`)
  revalidatePath(`/pedidos/${orcamentoId}/separacao`)
  revalidatePath(`/pedidos/${orcamentoId}/faltantes`)

  const total = validas.reduce((s, v) => s + v.quantidade, 0)
  return {
    success: true,
    message:
      total === 0
        ? 'Nada faltando neste pedido'
        : `${total} peça(s) marcada(s) como faltante`,
  }
}
