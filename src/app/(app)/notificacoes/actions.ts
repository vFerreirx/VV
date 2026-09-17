'use server'

import { and, asc, eq, isNull, lte, ne, or } from 'drizzle-orm'

import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { resumoDaReposicao } from '../estoque/actions'
import { requireAuth } from '@/lib/auth/require-auth'
import { condicaoDeProducaoAtrasada } from '@/lib/db/atraso-da-op'
import { db } from '@/lib/db'
import { hojeEmBrasilia } from '@/lib/dia-brasil'
import {
  compradores,
  orcamentoParcelas,
  orcamentos,
  ordensProducao,
  produtos,
} from '@/lib/db/schema'
import { situacaoDaParcela } from '@/lib/parcela-estado'

// Notificações derivadas do estado atual (sem tabela persistente).
// Quando o assunto é resolvido (OP enviada, parcela recebida), o alerta some
// sozinho — não há linha pra apagar, nem risco de sobrar aviso de coisa que
// já foi resolvida.

export type Notificacao = {
  id: string
  tipo: 'op_atrasada' | 'parcela_a_conferir' | 'reposicao_estoque'
  titulo: string
  descricao: string
  href: string
  // 'critico' quando passou de muito tempo, senão 'aviso'
  severidade: 'aviso' | 'critico'
  // Timestamp do evento (data prevista que foi ultrapassada)
  referenciaEm: Date
}

const DIAS = 24 * 60 * 60 * 1000

export async function listarNotificacoes(): Promise<Notificacao[]> {
  const user = await requireAuth()
  const now = Date.now()

  // QUEM VÊ AS PARCELAS. Elas moram na página do PEDIDO, então seguem a área
  // `pedidos` — e não `vendas`, que é só o faturamento. O operador do chão de
  // fábrica não tem o que fazer com boleto de cliente: o sino dele ficaria
  // aceso por um assunto que não é dele. Mesma pergunta que a guarda de
  // página faz, só que aqui ela decide se a CONSULTA acontece.
  const veFinanceiro =
    (await nivelDaAreaPara(user.role, 'pedidos')) !== 'nenhum'

  // Operador só é alertado de OPs livres ou que ele pegou; os demais
  // cargos veem tudo (mesma regra de visibilidade do kanban).
  const visibilidade = user.role !== 'operador'
    ? undefined
    : or(
        isNull(ordensProducao.responsavelId),
        eq(ordensProducao.responsavelId, user.id),
      )

  // 1) OPs com PRODUÇÃO atrasada: prazo vencido e produção não concluída.
  // Concluída e sem baixa não é atraso — ver src/lib/producao/atraso-da-op.ts.
  const opsAtrasadas = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      produtoNome: produtos.nome,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        condicaoDeProducaoAtrasada(),
        visibilidade,
      ),
    )
    .orderBy(asc(ordensProducao.dataPrevistaFim))
    .limit(50)

  const notificacoes: Notificacao[] = []

  for (const op of opsAtrasadas) {
    const data = new Date(op.dataPrevistaFim!)
    const diasAtraso = Math.floor((now - data.getTime()) / DIAS)
    notificacoes.push({
      id: `op-${op.id}`,
      tipo: 'op_atrasada',
      titulo: `${op.numero} atrasada`,
      descricao:
        diasAtraso === 0
          ? `${op.produtoNome} — venceu hoje`
          : `${op.produtoNome} — ${diasAtraso} dia${diasAtraso === 1 ? '' : 's'} de atraso`,
      href: `/ordens/${op.id}`,
      severidade: diasAtraso >= 3 ? 'critico' : 'aviso',
      referenciaEm: data,
    })
  }

  // 2) PARCELAS A CONFERIR — boleto/cheque que venceu e ninguém deu baixa.
  //
  // ⚠️ APARECE A PARTIR DO DIA DO VENCIMENTO, não antes. A pergunta é "o
  // dinheiro caiu?", e ela só existe depois da data — avisar na véspera
  // encheria o sino de coisa sobre a qual não há nada a fazer, e um sino que
  // está sempre aceso deixa de ser lido.
  //
  // Some sozinha quando dão baixa: `recebido_em IS NULL` é o filtro, e é o
  // mesmo estado que a tela do pedido mostra. Sem tabela de lembrete.
  if (veFinanceiro) {
    const hoje = hojeEmBrasilia()
    const parcelas = await db
      .select({
        id: orcamentoParcelas.id,
        numero: orcamentoParcelas.numero,
        vencimento: orcamentoParcelas.vencimento,
        valor: orcamentoParcelas.valor,
        orcamentoId: orcamentos.id,
        orcamentoNumero: orcamentos.numero,
        cliente: orcamentos.cliente,
        compradorNome: compradores.nome,
      })
      .from(orcamentoParcelas)
      .innerJoin(orcamentos, eq(orcamentos.id, orcamentoParcelas.orcamentoId))
      .leftJoin(compradores, eq(compradores.id, orcamentos.compradorId))
      .where(
        and(
          isNull(orcamentoParcelas.recebidoEm),
          // Comparação de `date` com texto 'YYYY-MM-DD': os dois lados são o
          // mesmo tipo e não há fuso no meio. Ver src/lib/parcela-estado.ts.
          lte(orcamentoParcelas.vencimento, hoje),
          isNull(orcamentos.deletedAt),
          // Pedido cancelado não tem o que cobrar.
          ne(orcamentos.status, 'cancelado'),
        ),
      )
      .orderBy(asc(orcamentoParcelas.vencimento))
      .limit(50)

    for (const p of parcelas) {
      // A CLASSIFICAÇÃO VEM DO MESMO MÓDULO QUE A TELA usa. Se o sino
      // contasse os dias por conta própria, ele diria "atrasada há 2 dias"
      // enquanto o painel do mesmo pedido diria "vence hoje".
      const s = situacaoDaParcela(p.vencimento, null, hoje)
      const quanto = Number(p.valor).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      })
      const quem = p.compradorNome ?? p.cliente

      notificacoes.push({
        id: `parcela-${p.id}`,
        tipo: 'parcela_a_conferir',
        titulo:
          s.estado === 'atrasada'
            ? `Parcela ${p.numero}ª do pedido #${p.orcamentoNumero} venceu há ${s.diasAtraso} dia${s.diasAtraso === 1 ? '' : 's'}`
            : `Parcela ${p.numero}ª do pedido #${p.orcamentoNumero} vence hoje`,
        descricao: `${quem} — ${quanto}. Conferir se caiu.`,
        href: `/pedidos/${p.orcamentoId}`,
        // Mesmo corte das OPs: 3 dias vira crítico. Dois assuntos diferentes
        // no mesmo sino precisam graduar igual, senão a cor não quer dizer
        // nada.
        severidade: s.diasAtraso >= 3 ? 'critico' : 'aviso',
        // Meia-noite UTC do dia do vencimento: serve só pra ORDENAR a lista
        // ao lado das OPs, que trazem instante de verdade. A classificação
        // (hoje/atrasada) já foi feita em texto, sem fuso.
        referenciaEm: new Date(`${p.vencimento}T00:00:00Z`),
      })
    }
  }

  // 3) REPOSIÇÃO DE ESTOQUE — peças que alguém avisou que estão acabando e
  // que ainda não viraram OP. UMA notificação agregada, e não uma por peça:
  // vinte peças acabando são um assunto só ("olhe a fila"), e vinte linhas
  // enterrariam as OPs atrasadas no sino.
  //
  // Só pra quem tem escrita em Ordens — quem decide produzir; o resumo volta
  // vazio pros outros. Some sozinha quando a fila de abertos esvazia.
  const reposicao = await resumoDaReposicao()
  if (reposicao.acabou + reposicao.acabando > 0) {
    const partes: string[] = []
    if (reposicao.acabando > 0) {
      partes.push(
        `${reposicao.acabando} ${reposicao.acabando === 1 ? 'peça acabando' : 'peças acabando'}`,
      )
    }
    if (reposicao.acabou > 0) partes.push(`${reposicao.acabou} acabou`)
    notificacoes.push({
      id: 'reposicao-estoque',
      tipo: 'reposicao_estoque',
      titulo: partes.join(' · '),
      descricao: 'Fila de reposição de estoque esperando virar OP.',
      href: '/estoque',
      // Peça que ACABOU é venda perdida: crítico. Só "acabando" é aviso.
      severidade: reposicao.acabou > 0 ? 'critico' : 'aviso',
      referenciaEm: reposicao.maisAntigoEm ?? new Date(),
    })
  }

  // Ordena por mais atrasado primeiro
  notificacoes.sort(
    (a, b) => a.referenciaEm.getTime() - b.referenciaEm.getTime(),
  )

  return notificacoes
}
