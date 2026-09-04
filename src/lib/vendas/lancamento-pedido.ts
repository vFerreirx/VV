// PEDIDO FINALIZADO VIRA VENDA DO DIA.
//
// ─────────────────────────────────────────────────────────────────────────
// SÃO DUAS GRAVAÇÕES, E CADA UMA RESOLVE UM PROBLEMA DIFERENTE
// ─────────────────────────────────────────────────────────────────────────
//
//  1. `vendas_pedidos` — O DETALHE. Uma linha por pedido finalizado, com o
//     número e o cliente. É a única forma de o NÚMERO sobreviver:
//     `salvarVendaDiaAction` e `importarVendasCSVAction` apagam todas as
//     linhas de `vendas_marketplace` do dia e regravam do formulário/arquivo,
//     então um lançamento "comum" ali seria varrido no próximo salvamento
//     manual daquele dia, em silêncio.
//
//  2. A linha ESPELHO em `vendas_marketplace`, conta 'atacado_pedidos' — O
//     DINHEIRO. É ela que faz o valor entrar no total do dia, na aba Mensal,
//     no relatório por conta e na tendência SEM tocar em nenhuma dessas
//     telas. Sem ela a soma das contas para de bater com o total do período:
//     relatorios/actions.ts soma o total de `vendas` e o detalhe por conta de
//     `vendas_marketplace`, e os dois têm que fechar.
//
// ⚠️ AS DUAS SÃO O MESMO DINHEIRO visto de dois jeitos. Somar as duas conta a
// venda DUAS VEZES — o bloco "Pedidos finalizados" da tela de vendas é o
// detalhe da linha espelho, não uma parcela a mais.
//
// ─────────────────────────────────────────────────────────────────────────
// O QUE ENTRA, E DE QUE DIA
// ─────────────────────────────────────────────────────────────────────────
//
// VALOR = produtos − desconto, SEM FRETE. Frete é repasse à transportadora;
// somá-lo infla o faturamento do dia. Tudo em CENTAVOS INTEIROS, com os
// helpers de src/lib/total-pedido.ts.
//
// ⚠️ UM PEDIDO É UMA VENDA, de quantas peças for.
//
// `vendas_marketplace.quantidade` conta VENDAS — a coluna da tela se chama
// "Vendas", e uma conta do Mercado Livre com 196 no dia teve 196 PEDIDOS, não
// 196 peças. Então a linha espelho conta LINHAS de `vendas_pedidos`, uma por
// pedido, e NUNCA soma as peças: um pedido de 86 peças entraria no dia como
// 86 vendas e o número da tela viraria outra coisa.
//
// As peças continuam guardadas, em `vendas_pedidos.unidades` — nome próprio
// justamente porque as duas colunas já se chamaram `quantidade`, e a soma
// errada passa no type-check e some no meio de um total plausível. É o
// detalhe por pedido que a tela de vendas mostra.
//
// DIA = o dia em que foi finalizado, no fuso de BRASÍLIA
// (`hojeEmBrasilia()`, nunca `new Date()` do servidor: a Vercel roda em UTC e
// finalizar às 21h30 cairia no dia seguinte — ver src/lib/dia-brasil.ts).
//
// E o dia NÃO MUDA depois. Editar em outubro um pedido finalizado em setembro
// atualiza o valor da venda de SETEMBRO; mover o dinheiro de mês porque
// alguém corrigiu um preço reescreveria um fechamento já conferido.
//
// ─────────────────────────────────────────────────────────────────────────
// SEM 'use server' DE PROPÓSITO
// ─────────────────────────────────────────────────────────────────────────
// Isto é helper de banco chamado DENTRO de transação, não server action. Dois
// arquivos 'use server' se importando fecham ciclo — é o mesmo motivo já
// documentado em pedidos/actions.ts, na contagem de faltantes.

import { and, eq, isNull, sql } from 'drizzle-orm'

import { hojeEmBrasilia } from '@/lib/dia-brasil'
import type { db as Db } from '@/lib/db'
import {
  orcamentoItens,
  orcamentos,
  vendas,
  vendasMarketplace,
  vendasPedidos,
} from '@/lib/db/schema'
import { descontoEmCentavos } from '@/lib/total-pedido'

/** A transação do Drizzle — o único jeito de chamar a sincronização. */
type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0]

/** A conta ESPELHO. Escrita só por aqui; ver src/lib/validators/vendas.ts. */
export const CONTA_PEDIDOS = 'atacado_pedidos'
const MARKETPLACE_PEDIDOS = 'vendas_atacado'

const reais = (centavos: number) => (centavos / 100).toFixed(2)

/**
 * Reconcilia o lançamento de venda de UM pedido com o estado atual dele.
 *
 * IDEMPOTENTE: rodar de novo com o mesmo estado não muda nada. É por isso que
 * ela pode ser chamada de qualquer action que mexa no pedido — mudar status,
 * editar itens, excluir — sem quem chama precisar saber o que mudou.
 *
 * ⚠️ `criar: false` É O QUE IMPEDE CARGA RETROATIVA POR ACIDENTE.
 *
 * Só a MUDANÇA DE STATUS cria lançamento. Editar e excluir passam
 * `criar: false` e apenas atualizam (ou removem) um lançamento que já existe.
 * Sem essa distinção, editar hoje um pedido finalizado em setembro — que não
 * tem lançamento, porque é anterior a esta funcionalidade — criaria uma venda
 * datada de HOJE: dinheiro velho entrando no mês errado, disparado por uma
 * correção de texto. A regra combinada é que ela vale daqui pra frente, e é
 * este parâmetro que a cumpre.
 *
 * Devolve o dia afetado, ou `null` quando não havia nada a fazer: é assim que
 * a action sabe se precisa revalidar /vendas e /relatorios.
 */
export async function sincronizarVendaDoPedido(
  tx: Tx,
  orcamentoId: string,
  { criar = true }: { criar?: boolean } = {},
): Promise<string | null> {
  const [pedido] = await tx
    .select({
      id: orcamentos.id,
      numero: orcamentos.numero,
      cliente: orcamentos.cliente,
      status: orcamentos.status,
      deletedAt: orcamentos.deletedAt,
      descontoPercentual: orcamentos.descontoPercentual,
    })
    .from(orcamentos)
    .where(eq(orcamentos.id, orcamentoId))
    .limit(1)

  // O lançamento que já existe, junto do DIA dele — é esse dia que manda de
  // agora em diante, tanto pra atualizar quanto pra apagar.
  const [lancado] = await tx
    .select({
      id: vendasPedidos.id,
      dia: vendas.data,
    })
    .from(vendasPedidos)
    .innerJoin(vendas, eq(vendas.id, vendasPedidos.vendaId))
    .where(eq(vendasPedidos.orcamentoId, orcamentoId))
    .limit(1)

  const finalizado =
    pedido !== undefined &&
    pedido.deletedAt === null &&
    pedido.status === 'finalizado'

  // SAIU DE FINALIZADO (ou foi excluído) ⇒ o lançamento some e o dia é
  // recalculado. Sem isso o número do dia ficaria alto e ninguém saberia por
  // quê — pior do que nunca ter lançado.
  if (!finalizado) {
    if (!lancado) return null
    await tx.delete(vendasPedidos).where(eq(vendasPedidos.id, lancado.id))
    await recalcularDia(tx, lancado.dia)
    return lancado.dia
  }

  // Finalizado, mas sem lançamento e sem licença pra criar: é o pedido
  // anterior à funcionalidade sendo editado. Não é para virar venda de hoje.
  if (!lancado && !criar) return null

  const itens = await tx
    .select({
      quantidade: orcamentoItens.quantidade,
      precoUnitario: orcamentoItens.precoUnitario,
    })
    .from(orcamentoItens)
    .where(eq(orcamentoItens.orcamentoId, orcamentoId))

  const unidades = itens.reduce((s, it) => s + it.quantidade, 0)
  const mercadoria = itens.reduce(
    (s, it) => s + it.quantidade * Number(it.precoUnitario),
    0,
  )
  // Produtos − desconto. O frete fica de fora: é repasse, não faturamento.
  const centavos =
    Math.round(mercadoria * 100) -
    descontoEmCentavos(mercadoria, pedido.descontoPercentual)

  // O dia do lançamento existente vence o de hoje — ver o cabeçalho.
  const dia = lancado?.dia ?? hojeEmBrasilia()
  const vendaId = await garantirVendaDoDia(tx, dia)

  if (lancado) {
    await tx
      .update(vendasPedidos)
      .set({
        // Reancora: se o dia tinha sido excluído (soft delete), a linha viva
        // daquele MESMO dia é outra, e o lançamento precisa segui-la — senão
        // o UNIQUE(orcamento_id) impediria qualquer lançamento novo.
        vendaId,
        numero: pedido.numero,
        cliente: pedido.cliente,
        unidades,
        faturamento: reais(centavos),
      })
      .where(eq(vendasPedidos.id, lancado.id))
  } else {
    await tx.insert(vendasPedidos).values({
      vendaId,
      orcamentoId,
      numero: pedido.numero,
      cliente: pedido.cliente,
      unidades,
      faturamento: reais(centavos),
    })
  }

  await recalcularDia(tx, dia)
  return dia
}

/**
 * A linha viva de `vendas` daquele dia, criando se preciso.
 *
 * O índice único de `vendas` é PARCIAL (`WHERE deleted_at IS NULL`), então um
 * dia excluído não impede a linha nova — e é justamente por isso que a busca
 * precisa filtrar por `deletedAt` também: sem o filtro ela acharia a excluída
 * e gravaria numa venda que ninguém vê.
 */
async function garantirVendaDoDia(tx: Tx, dia: string): Promise<string> {
  const [existente] = await tx
    .select({ id: vendas.id })
    .from(vendas)
    .where(and(eq(vendas.data, dia), isNull(vendas.deletedAt)))
    .limit(1)
  if (existente) return existente.id

  const [nova] = await tx
    .insert(vendas)
    .values({ data: dia, quantidade: 0, faturamento: null })
    .returning({ id: vendas.id })
  return nova!.id
}

/**
 * Refaz os dois números derivados do dia, nesta ordem:
 *
 *   1. a linha ESPELHO 'atacado_pedidos' = quantos PEDIDOS o dia tem (uma
 *      venda por pedido, ver o cabeçalho) e a soma do faturamento deles;
 *   2. `vendas.quantidade` / `vendas.faturamento` = soma de TODAS as contas,
 *      que é o que as actions de vendas já fazem hoje.
 *
 * NENHUM PEDIDO APAGA A LINHA ESPELHO em vez de gravar zero: uma conta zerada
 * na tabela por marketplace afirma "não vendemos nada por aqui hoje", e a
 * afirmação aqui seria falsa — não houve pedido nenhum. Mesma regra do frete
 * e do desconto no documento do pedido (src/lib/total-pedido.ts).
 */
async function recalcularDia(tx: Tx, dia: string): Promise<void> {
  const [venda] = await tx
    .select({ id: vendas.id, observacao: vendas.observacao })
    .from(vendas)
    .where(and(eq(vendas.data, dia), isNull(vendas.deletedAt)))
    .limit(1)
  if (!venda) return

  // `count(*)`, não `sum(unidades)`: um pedido é uma venda. As peças ficam em
  // `vendas_pedidos.unidades` e não entram aqui — ver o cabeçalho.
  const [somaPedidos] = await tx
    .select({
      pedidos: sql<number>`count(*)::int`,
      faturamento: sql<string>`coalesce(sum(${vendasPedidos.faturamento}), 0)`,
    })
    .from(vendasPedidos)
    .where(eq(vendasPedidos.vendaId, venda.id))

  const qtdPedidos = somaPedidos?.pedidos ?? 0
  const fatPedidos = Number(somaPedidos?.faturamento ?? 0)

  const espelho = and(
    eq(vendasMarketplace.vendaId, venda.id),
    eq(vendasMarketplace.conta, CONTA_PEDIDOS),
  )

  if (qtdPedidos === 0 && fatPedidos === 0) {
    await tx.delete(vendasMarketplace).where(espelho)
  } else {
    const [jaTem] = await tx
      .select({ id: vendasMarketplace.id })
      .from(vendasMarketplace)
      .where(espelho)
      .limit(1)
    const valores = {
      quantidade: qtdPedidos,
      faturamento: fatPedidos.toFixed(2),
    }
    if (jaTem) {
      await tx
        .update(vendasMarketplace)
        .set(valores)
        .where(eq(vendasMarketplace.id, jaTem.id))
    } else {
      await tx.insert(vendasMarketplace).values({
        vendaId: venda.id,
        marketplace: MARKETPLACE_PEDIDOS,
        conta: CONTA_PEDIDOS,
        ...valores,
      })
    }
  }

  const contas = await tx
    .select({
      quantidade: vendasMarketplace.quantidade,
      faturamento: vendasMarketplace.faturamento,
    })
    .from(vendasMarketplace)
    .where(eq(vendasMarketplace.vendaId, venda.id))

  // DIA ÓRFÃO: sem conta nenhuma, sem pedido e sem observação, esta linha só
  // existia por causa do lançamento que acabou de sair. Deixá-la faria o dia
  // contar como "dia com venda" no `count(*)` do relatório e aparecer zerado
  // na lista de dias recentes. A condição é conservadora de propósito — dia
  // com observação, ou com qualquer outra conta, nunca é tocado.
  if (contas.length === 0 && venda.observacao === null) {
    const [aindaTem] = await tx
      .select({ id: vendasPedidos.id })
      .from(vendasPedidos)
      .where(eq(vendasPedidos.vendaId, venda.id))
      .limit(1)
    if (!aindaTem) {
      await tx.delete(vendas).where(eq(vendas.id, venda.id))
      return
    }
  }

  // Totais do dia = soma das contas, igual às actions de vendas. O faturamento
  // vira `null` quando NENHUMA conta informou valor — é a ausência que a tela
  // lê como "não informado", e um zero gravado ali afirmaria que o dia fechou
  // zerado.
  const totalQtd = contas.reduce((s, c) => s + c.quantidade, 0)
  const temFat = contas.some((c) => c.faturamento !== null)
  const totalFat = temFat
    ? contas.reduce((s, c) => s + Number(c.faturamento ?? 0), 0).toFixed(2)
    : null

  await tx
    .update(vendas)
    .set({ quantidade: totalQtd, faturamento: totalFat })
    .where(eq(vendas.id, venda.id))
}
