import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { erroDeProdutoDeParceiro } from '@/lib/db/origem-do-produto'
import {
  eventosKanban,
  ordensProducao,
  produtos,
  reposicoesEstoque,
  variacoesProduto,
} from '@/lib/db/schema'
import { erroDaVariacao } from '@/lib/producao/catalogo-op'

// A CRIAÇÃO DE UMA OP — o que toda porta que cria OP avulsa faz igual.
//
// Duas portas, e as duas passam por aqui:
//
//   - `criarOrdemAction` (ordens/actions.ts): a Nova OP, o "Produzir" de um
//     item da fila de reposição e o faltante de pedido — uma OP por vez;
//   - `marcarReposicaoAction` (estoque/actions.ts) com `criarOps`: o gerente
//     marca as peças com a quantidade e cria uma OP por peça, NUMA TRANSAÇÃO
//     SÓ (Q201).
//
// ⚠️ UM CAMINHO SÓ. O lote não pode ser uma cópia da Nova OP: a primeira
// mudança na regra (um campo novo, uma guarda nova) valeria só pra uma das
// duas, e a OP de reposição em lote nasceria diferente da criada uma a uma.
// Mesmo motivo de `gravarBaixa` (baixa-da-op.ts).
//
// ⚠️ SERVER-ONLY, E NÃO EXPORTADA DE UM ARQUIVO 'use server': toda função
// exportada de lá vira endpoint público. Estas não conferem permissão — só
// rodam dentro de uma action que já conferiu.
//
// O que fica de fora, em quem chama: a permissão, o parse da entrada, a
// remessa do Full e a conferência do faltante de pedido (só a Nova OP tem).

type OrdemProducao = typeof ordensProducao.$inferSelect
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * A peça pode virar OP? O produto está ativo no catálogo, cada variação é
 * dele e não foi apagada, e o produto não é de parceiro. Devolve a frase pra
 * action, ou null.
 *
 * O catálogo pode mudar entre abrir a tela e salvar, e a FK sozinha aceita
 * variação de outro produto — por isso confere de novo no servidor.
 */
export async function erroDaPecaDaOp(
  produtoId: string,
  variacaoIds: readonly (string | null | undefined)[],
): Promise<string | null> {
  const catalogo = await db
    .select({ variacaoId: variacoesProduto.id })
    .from(produtos)
    .leftJoin(
      variacoesProduto,
      and(
        eq(variacoesProduto.produtoId, produtos.id),
        isNull(variacoesProduto.deletedAt),
      ),
    )
    .where(
      and(
        eq(produtos.id, produtoId),
        eq(produtos.ativo, true),
        isNull(produtos.deletedAt),
      ),
    )
  if (!catalogo.length) {
    return 'Produto indisponível. Selecione novamente no catálogo.'
  }
  // PRODUTO DE PARCEIRO NÃO VIRA OP. Ver src/lib/db/origem-do-produto.ts.
  const erroOrigem = await erroDeProdutoDeParceiro([produtoId])
  if (erroOrigem) return erroOrigem
  // Variação SEMPRE obrigatória — ver `erroDaVariacao` (catalogo-op.ts).
  const disponiveis = catalogo.flatMap((v) =>
    v.variacaoId ? [{ id: v.variacaoId }] : [],
  )
  for (const variacaoId of variacaoIds) {
    const erro = erroDaVariacao(variacaoId, disponiveis)
    if (erro) return erro
  }
  return null
}

/**
 * O item da fila de reposição que a OP atende já não está aberto (outra
 * pessoa produziu ou descartou no meio). Lançado de dentro da transação pra
 * desfazê-la: a OP não pode nascer sem o item que justificou criá-la — e, no
 * lote, nenhuma das outras fica.
 */
export class ReposicaoIndisponivel extends Error {}

export type NovaOp = {
  produtoId: string
  variacaoId: string
  quantidade: number
  canalDestino: OrdemProducao['canalDestino']
  prioridade: OrdemProducao['prioridade']
  status: OrdemProducao['status']
  dataPrevistaInicio: Date | null
  dataPrevistaFim: Date | null
  maquinaId: string | null
  responsavelId: string | null
  observacoes: string | null
  remessaFullId: string | null
  /** O faltante de pedido que esta OP produz (conferido por quem chama). */
  orcamentoId: string | null
  orcamentoFaltanteChave: string | null
}

/**
 * Grava a OP dentro da transação `tx`: a OP, o evento inicial do kanban e,
 * com `reposicaoId`, a ligação ao item da fila — que passa a "Em produção".
 *
 * A ligação é um UPDATE CONDICIONAL: só pega o item ainda ABERTO e da MESMA
 * variação. Se ninguém casar, lança `ReposicaoIndisponivel` e a transação
 * inteira é desfeita — nada de OP de reposição sem a reposição.
 */
export async function gravarOp(
  tx: Tx,
  op: NovaOp,
  { usuarioId, reposicaoId }: { usuarioId: string; reposicaoId?: string },
): Promise<{ id: string; numero: string }> {
  const [inserida] = await tx
    .insert(ordensProducao)
    .values({
      // Trigger BEFORE INSERT sobrescreve com 'OP-AAAA-NNNN'.
      numero: '',
      produtoId: op.produtoId,
      variacaoId: op.variacaoId,
      quantidade: op.quantidade,
      maquinaId: op.maquinaId,
      canalDestino: op.canalDestino,
      prioridade: op.prioridade,
      status: op.status,
      dataPrevistaInicio: op.dataPrevistaInicio,
      dataPrevistaFim: op.dataPrevistaFim,
      remessaFullId: op.remessaFullId,
      criadoPor: usuarioId,
      responsavelId: op.responsavelId,
      observacoes: op.observacoes,
      orcamentoId: op.orcamentoId,
      orcamentoFaltanteChave: op.orcamentoFaltanteChave,
    })
    .returning({ id: ordensProducao.id, numero: ordensProducao.numero })

  // Evento inicial no kanban (statusAnterior = null).
  await tx.insert(eventosKanban).values({
    ordemId: inserida!.id,
    statusAnterior: null,
    statusNovo: op.status,
    usuarioId,
    observacao: 'OP criada',
  })

  if (reposicaoId !== undefined) {
    const ligados = await tx
      .update(reposicoesEstoque)
      .set({ estado: 'em_producao', ordemId: inserida!.id })
      .where(
        and(
          eq(reposicoesEstoque.id, reposicaoId),
          eq(reposicoesEstoque.estado, 'aberto'),
          eq(reposicoesEstoque.variacaoId, op.variacaoId),
        ),
      )
      .returning({ id: reposicoesEstoque.id })
    if (ligados.length === 0) throw new ReposicaoIndisponivel()
  }

  return inserida!
}
