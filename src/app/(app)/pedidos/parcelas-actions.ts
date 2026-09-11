'use server'

import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { obterOrcamento } from './actions'
import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { orcamentoParcelas, users } from '@/lib/db/schema'
import { hojeEmBrasilia, somarDias } from '@/lib/dia-brasil'
import { DIAS_ATE_O_PRIMEIRO } from '@/lib/parcela-estado'

// ─────────────────────────────────────────────────────────────────────────
// PARCELAS DO PEDIDO — os vencimentos de boleto/cheque.
//
// Existem pra dar o que LEMBRAR: o sino deriva daqui o aviso de "confira se
// esse boleto caiu", sem tabela de lembrete. Dar baixa apaga o aviso sozinho.
//
// ESCOPO: isto só REGISTRA vencimento e baixa. Não emite boleto, não
// concilia extrato e não muda o status do pedido — ficou de fora de
// propósito, do mesmo jeito que `faltantes-actions.ts` só registra.
// ─────────────────────────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

/** Uma parcela como ela vai pra tela. */
export type Parcela = {
  id: string
  numero: number
  /** 'YYYY-MM-DD' — `date` no banco, texto aqui. Nunca vira `Date`. */
  vencimento: string
  /** numeric(12,2) como string: "1234.56". */
  valor: string
  observacao: string | null
  recebidoEm: Date | null
  /** Nome de quem deu baixa, pra linha dizer "recebida em … por Fulano". */
  recebidoPorNome: string | null
}

/** Teto de sanidade. 36× já é mais do que qualquer acerto real daqui. */
const MAX_PARCELAS = 36

// ⚠️ FUNÇÃO SEPARADA, e não mais um campo em `obterOrcamento`. Aquela serve
// o documento, a via de separação e o romaneio — três telas que não têm o
// que fazer com parcela. É o mesmo raciocínio escrito em
// `obterOrcamentoParaRomaneio` (./actions.ts): quem precisa do extra carrega
// o extra, e o caminho das outras não muda. A página do pedido chama esta em
// paralelo, junto de `listarFaltantes`.
export async function listarParcelas(orcamentoId: string): Promise<Parcela[]> {
  await requireArea('vendas')
  const rows = await db
    .select({
      id: orcamentoParcelas.id,
      numero: orcamentoParcelas.numero,
      vencimento: orcamentoParcelas.vencimento,
      valor: orcamentoParcelas.valor,
      observacao: orcamentoParcelas.observacao,
      recebidoEm: orcamentoParcelas.recebidoEm,
      recebidoPorNome: users.nome,
    })
    .from(orcamentoParcelas)
    .leftJoin(users, eq(users.id, orcamentoParcelas.recebidoPor))
    .where(eq(orcamentoParcelas.orcamentoId, orcamentoId))
    .orderBy(asc(orcamentoParcelas.numero))

  return rows.map((r) => ({ ...r, recebidoPorNome: r.recebidoPorNome ?? null }))
}

function revalidar(orcamentoId: string) {
  revalidatePath('/pedidos')
  revalidatePath(`/pedidos/${orcamentoId}`)
}

/**
 * Gera as parcelas a partir de nº de parcelas + 1º vencimento + intervalo.
 *
 * ⚠️ A DIVISÃO ACONTECE EM CENTAVOS INTEIROS, e o resto vai na PRIMEIRA
 * parcela. Somar em ponto flutuante é o que produz "R$ 1.234,5699999" numa
 * cobrança — o cabeçalho de src/lib/total-pedido.ts explica por extenso. E a
 * sobra precisa cair em alguma parcela, senão a soma não fecha com o total:
 * R$ 100,00 em 3× é 33,34 + 33,33 + 33,33, e não três de 33,33.
 *
 * A BASE É `totalFinal` — mercadoria − desconto + frete, o que o cliente
 * paga. Não é `total` (só mercadoria) nem `totalComFrete` (sem desconto):
 * parcelar o que o cliente não deve cobraria a mais.
 */
export async function gerarParcelasAction(
  orcamentoId: string,
  entrada: {
    quantidade: number
    /** 'YYYY-MM-DD'. */
    primeiroVencimento: string
    intervaloDias: number
  },
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')

  const quantidade = Math.floor(Number(entrada.quantidade))
  if (!Number.isFinite(quantidade) || quantidade < 1) {
    return { success: false, error: 'Informe ao menos 1 parcela' }
  }
  if (quantidade > MAX_PARCELAS) {
    return { success: false, error: `No máximo ${MAX_PARCELAS} parcelas` }
  }

  const intervalo = Math.floor(Number(entrada.intervaloDias))
  if (!Number.isFinite(intervalo) || intervalo < 0) {
    return { success: false, error: 'Intervalo inválido' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.primeiroVencimento)) {
    return { success: false, error: 'Data do primeiro vencimento inválida' }
  }

  const orcamento = await obterOrcamento(orcamentoId)
  if (!orcamento) return { success: false, error: 'Pedido não encontrado' }

  const totalCentavos = Math.round(orcamento.totalFinal * 100)
  if (totalCentavos <= 0) {
    return {
      success: false,
      error: 'Este pedido não tem valor pra parcelar',
    }
  }

  // ⚠️ REGERAR NUNCA APAGA PARCELA JÁ RECEBIDA. Uma baixa é registro de que
  // o dinheiro caiu, com data e autor — sobrescrever isso apagaria a única
  // prova de um recebimento. Recusa e diz quais, pra dar o que fazer.
  const recebidas = await db
    .select({ numero: orcamentoParcelas.numero })
    .from(orcamentoParcelas)
    .where(
      and(
        eq(orcamentoParcelas.orcamentoId, orcamentoId),
        isNotNull(orcamentoParcelas.recebidoEm),
      ),
    )
    .orderBy(asc(orcamentoParcelas.numero))
  if (recebidas.length > 0) {
    const lista = recebidas.map((r) => `${r.numero}ª`).join(', ')
    return {
      success: false,
      error: `Não dá pra regerar: ${lista} já foi recebida. Desfaça o recebimento ou edite as parcelas uma a uma.`,
    }
  }

  const base = Math.floor(totalCentavos / quantidade)
  const resto = totalCentavos - base * quantidade

  const linhas = Array.from({ length: quantidade }, (_, i) => ({
    orcamentoId,
    numero: i + 1,
    vencimento: somarDias(entrada.primeiroVencimento, i * intervalo),
    valor: ((i === 0 ? base + resto : base) / 100).toFixed(2),
  }))

  await db.transaction(async (tx) => {
    // Substitui o conjunto inteiro — é o que faz a numeração recomeçar do 1
    // e o que permite mudar de 3× pra 2× sem sobrar linha órfã. Só chega
    // aqui se nenhuma estava recebida (checado acima).
    await tx
      .delete(orcamentoParcelas)
      .where(eq(orcamentoParcelas.orcamentoId, orcamentoId))
    await tx.insert(orcamentoParcelas).values(linhas)
  })

  revalidar(orcamentoId)
  return {
    success: true,
    message:
      quantidade === 1
        ? 'Vencimento registrado'
        : `${quantidade} parcelas geradas`,
  }
}

/** Edita uma parcela já gerada. Tudo é editável depois — o gerador é só o começo. */
export async function salvarParcelaAction(
  parcelaId: string,
  dados: { vencimento: string; valor: string; observacao: string | null },
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')

  const [atual] = await db
    .select({ orcamentoId: orcamentoParcelas.orcamentoId })
    .from(orcamentoParcelas)
    .where(eq(orcamentoParcelas.id, parcelaId))
    .limit(1)
  if (!atual) return { success: false, error: 'Parcela não encontrada' }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.vencimento)) {
    return { success: false, error: 'Data de vencimento inválida' }
  }
  const centavos = Math.round(Number(dados.valor) * 100)
  if (!Number.isFinite(centavos) || centavos <= 0) {
    // O CHECK do banco recusaria igual; aqui a mensagem explica.
    return { success: false, error: 'O valor da parcela precisa ser maior que zero' }
  }

  await db
    .update(orcamentoParcelas)
    .set({
      vencimento: dados.vencimento,
      valor: (centavos / 100).toFixed(2),
      // Vazio vira NULL: "sem observação" é a ausência, não uma string em
      // branco que depois aparece como linha vazia na tela.
      observacao: dados.observacao?.trim() ? dados.observacao.trim() : null,
    })
    .where(eq(orcamentoParcelas.id, parcelaId))

  revalidar(atual.orcamentoId)
  return { success: true, message: 'Parcela salva' }
}

export async function removerParcelaAction(
  parcelaId: string,
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')

  const [atual] = await db
    .select({
      orcamentoId: orcamentoParcelas.orcamentoId,
      numero: orcamentoParcelas.numero,
      recebidoEm: orcamentoParcelas.recebidoEm,
    })
    .from(orcamentoParcelas)
    .where(eq(orcamentoParcelas.id, parcelaId))
    .limit(1)
  if (!atual) return { success: false, error: 'Parcela não encontrada' }

  // Mesma regra do regerar: apagar uma parcela recebida apagaria o registro
  // de que o dinheiro caiu.
  if (atual.recebidoEm) {
    return {
      success: false,
      error: 'Essa parcela já foi recebida. Desfaça o recebimento antes de remover.',
    }
  }

  await db.delete(orcamentoParcelas).where(eq(orcamentoParcelas.id, parcelaId))

  revalidar(atual.orcamentoId)
  return { success: true, message: `${atual.numero}ª parcela removida` }
}

/**
 * Dá baixa: grava DATA e AUTOR juntos.
 *
 * Os dois andam sempre juntos — o CHECK do banco garante — porque "recebida"
 * sem quem conferiu é informação pela metade: daqui a um mês a pergunta é
 * "quem disse que caiu?", e ela precisa ter resposta. Mesmo par de
 * `concluidaEm`/`concluidaPor` em `tarefas`.
 */
export async function marcarRecebidaAction(
  parcelaId: string,
): Promise<ActionResult> {
  const user = await requireAreaEscrita('vendas')

  const [atual] = await db
    .select({
      orcamentoId: orcamentoParcelas.orcamentoId,
      numero: orcamentoParcelas.numero,
      recebidoEm: orcamentoParcelas.recebidoEm,
    })
    .from(orcamentoParcelas)
    .where(eq(orcamentoParcelas.id, parcelaId))
    .limit(1)
  if (!atual) return { success: false, error: 'Parcela não encontrada' }

  // Já recebida não é erro: é o reenvio de quem tocou duas vezes ou voltou
  // numa aba velha. Dizer "já estava" é a verdade; dizer "falhou" mandaria
  // a pessoa procurar um problema que não existe.
  if (atual.recebidoEm) {
    return { success: true, message: 'Essa parcela já estava recebida' }
  }

  await db
    .update(orcamentoParcelas)
    .set({ recebidoEm: new Date(), recebidoPor: user.id })
    .where(eq(orcamentoParcelas.id, parcelaId))

  revalidar(atual.orcamentoId)
  return { success: true, message: `${atual.numero}ª parcela recebida` }
}

/** Desfaz a baixa — data e autor saem JUNTOS, senão o CHECK recusa. */
export async function desfazerRecebimentoAction(
  parcelaId: string,
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')

  const [atual] = await db
    .select({ orcamentoId: orcamentoParcelas.orcamentoId })
    .from(orcamentoParcelas)
    .where(eq(orcamentoParcelas.id, parcelaId))
    .limit(1)
  if (!atual) return { success: false, error: 'Parcela não encontrada' }

  await db
    .update(orcamentoParcelas)
    .set({ recebidoEm: null, recebidoPor: null })
    .where(eq(orcamentoParcelas.id, parcelaId))

  revalidar(atual.orcamentoId)
  return { success: true, message: 'Recebimento desfeito' }
}

/** O 1º vencimento sugerido: hoje + 30, no fuso de Brasília. */
export async function sugestaoDePrimeiroVencimento(): Promise<string> {
  return somarDias(hojeEmBrasilia(), DIAS_ATE_O_PRIMEIRO)
}
