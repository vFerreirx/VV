import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ordensProducao, reposicoesEstoque } from '@/lib/db/schema'
import { estadoDaReposicaoPelaOp } from '@/lib/producao/reposicao'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// O ITEM DA FILA DE REPOSIÇÃO ACOMPANHA A OP LIGADA A ELE.
//
// ⚠️ TODO CAMINHO QUE MUDA UMA OP QUE PODE ESTAR LIGADA CHAMA ISTO, dentro da
// própria transação: `gravarBaixa` (Dar baixa e Despachar),
// `cancelarOrdemAction`, `mudarStatusOrdemAction`, `atualizarOrdemAction`,
// `excluirOrdemAction` e `excluirMultiplasOrdensAction`. Esquecer um deles
// deixa o item "Em produção" com uma OP cancelada — e o índice único de
// "um item ativo por variação" impede marcar a peça de novo.
//
// É UMA função, e não um `if` por caminho: ela lê a OP como ficou DEPOIS da
// escrita e aplica a regra pura (`estadoDaReposicaoPelaOp`). Assim a baixa
// desfeita pelo board devolve o item a "Em produção", e trocar a variação no
// formulário devolve o item à fila, sem que cada action precise saber disso.
//
// ⚠️ SERVER-ONLY e fora de arquivo 'use server': recebe a transação por
// parâmetro e roda só dentro de uma action que já conferiu permissão.
export async function sincronizarReposicaoDaOp(
  tx: Tx,
  ordemIds: readonly string[],
): Promise<void> {
  if (ordemIds.length === 0) return

  const itens = await tx
    .select({
      id: reposicoesEstoque.id,
      variacaoId: reposicoesEstoque.variacaoId,
      estado: reposicoesEstoque.estado,
      opStatus: ordensProducao.status,
      opExcluidaEm: ordensProducao.deletedAt,
      opVariacaoId: ordensProducao.variacaoId,
      opCanal: ordensProducao.canalDestino,
    })
    .from(reposicoesEstoque)
    .leftJoin(ordensProducao, eq(ordensProducao.id, reposicoesEstoque.ordemId))
    .where(
      and(
        inArray(reposicoesEstoque.ordemId, [...ordemIds]),
        inArray(reposicoesEstoque.estado, ['em_producao', 'reposto']),
      ),
    )

  for (const item of itens) {
    const novo = estadoDaReposicaoPelaOp(
      item.opStatus === null
        ? null
        : {
            status: item.opStatus,
            excluida: item.opExcluidaEm !== null,
            variacaoId: item.opVariacaoId,
            canalDestino: item.opCanal ?? '',
          },
      item.variacaoId,
    )
    if (novo === item.estado) continue

    // ⚠️ VOLTAR A UM ESTADO ATIVO NÃO PODE COLIDIR com outro item ativo da
    // mesma variação (índice `reposicoes_estoque_variacao_ativa_uidx`, cujo
    // predicado inclui o 'pedido_parceiro' — os três de
    // ESTADOS_ATIVOS_DE_REPOSICAO; mudou lá, muda aqui). Sai
    // de "reposto" só quando ninguém marcou a peça de novo nesse meio tempo.
    // A condição vai no UPDATE, e não num catch: erro dentro da transação a
    // derrubaria inteira — e com ela a baixa ou o cancelamento da OP.
    const semOutroAtivo = sql`NOT EXISTS (
      SELECT 1 FROM reposicoes_estoque r2
      WHERE r2.variacao_id = ${item.variacaoId}
        AND r2.id <> ${item.id}
        AND r2.estado IN ('aberto', 'em_producao', 'pedido_parceiro')
    )`

    await tx
      .update(reposicoesEstoque)
      .set(
        novo === 'aberto'
          ? { estado: 'aberto', ordemId: null, repostoEm: null }
          : novo === 'reposto'
            ? { estado: 'reposto', repostoEm: new Date() }
            : { estado: 'em_producao', repostoEm: null },
      )
      .where(
        and(
          eq(reposicoesEstoque.id, item.id),
          eq(reposicoesEstoque.estado, item.estado),
          novo === 'reposto' ? undefined : semOutroAtivo,
        ),
      )
  }
}
