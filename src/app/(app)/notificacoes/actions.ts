'use server'

import { and, asc, eq, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'

import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { resumoDaReposicao } from '../estoque/actions'
import { requireAuth } from '@/lib/auth/require-auth'
import { diasDesdeOBackup, estadoDoBackup } from '@/lib/backup'
import { condicaoDeProducaoAtrasada } from '@/lib/db/atraso-da-op'
import { db } from '@/lib/db'
import { obterUltimoBackup } from '@/lib/db/ultimo-backup'
import { diaEmBrasilia, diasEntre, hojeEmBrasilia } from '@/lib/dia-brasil'
import {
  compradores,
  coresFornecedorFio,
  lotesFio,
  movimentacoesFio,
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
  tipo:
    | 'op_atrasada'
    | 'parcela_a_conferir'
    | 'reposicao_estoque'
    | 'fio_abaixo_do_minimo'
    | 'backup'
  titulo: string
  descricao: string
  href: string
  // 'critico' quando passou de muito tempo, senão 'aviso'
  severidade: 'aviso' | 'critico'
  // Timestamp do evento (data prevista que foi ultrapassada)
  referenciaEm: Date
}

export async function listarNotificacoes(): Promise<Notificacao[]> {
  const user = await requireAuth()
  const now = Date.now()

  // QUEM VÊ AS PARCELAS. Elas moram na página do PEDIDO, então seguem a área
  // `pedidos` — e não `vendas`, que é só o faturamento. O operador do chão de
  // fábrica não tem o que fazer com boleto de cliente: o sino dele ficaria
  // aceso por um assunto que não é dele. Mesma pergunta que a guarda de
  // página faz, só que aqui ela decide se a CONSULTA acontece.
  //
  // AS CINCO FONTES CORREM EM PARALELO. O sino recarrega a cada mudança de
  // OP em toda tela aberta; em série, a conexão ficava presa à soma delas.
  const veFinanceiro = nivelDaAreaPara(user.role, 'pedidos').then(
    (nivel) => nivel !== 'nenhum',
  )
  // Mesma regra pro fio: quem não tem a área não recebe o aviso — e a
  // CONSULTA nem acontece. O padrão do operador em `estoqueFios` é 'nenhum'.
  const veFio = nivelDaAreaPara(user.role, 'estoqueFios').then(
    (nivel) => nivel !== 'nenhum',
  )

  // Operador só é alertado de OPs livres ou que ele pegou; os demais
  // cargos veem tudo (mesma regra de visibilidade do kanban).
  const visibilidade = user.role !== 'operador'
    ? undefined
    : or(
        isNull(ordensProducao.responsavelId),
        eq(ordensProducao.responsavelId, user.id),
      )

  // 1) OPs com PRODUÇÃO atrasada: prazo vencido e produção não concluída.
  // Concluída e não despachada não é atraso — ver src/lib/producao/atraso-da-op.ts.
  const opsAtrasadasP = db
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

  const hoje = hojeEmBrasilia()
  const parcelasP = veFinanceiro.then((ve) => (ve ? buscarParcelas(hoje) : []))
  const reposicaoP = resumoDaReposicao()
  const fiosP = veFio.then((ve) => (ve ? coresAbaixoDoMinimo() : []))
  // Backup: `role === 'admin'`, e NÃO área — é o assunto do banco inteiro, e
  // o gerente não entra. Pros outros a consulta nem acontece.
  const backupP =
    user.role === 'admin' ? obterUltimoBackup() : Promise.resolve(undefined)

  const [opsAtrasadas, parcelas, reposicao, fios, ultimoBackup] =
    await Promise.all([opsAtrasadasP, parcelasP, reposicaoP, fiosP, backupP])

  const notificacoes: Notificacao[] = []

  for (const op of opsAtrasadas) {
    const data = new Date(op.dataPrevistaFim!)
    // DIAS DE CALENDÁRIO EM BRASÍLIA, e não blocos de 24h: o prazo é o FIM
    // do dia (`fimDoDiaEmBrasilia`), então às 10h do dia seguinte já é "1 dia
    // de atraso" — em blocos de 24h daria 0 e o sino diria "venceu hoje".
    const diasAtraso = diasEntre(diaEmBrasilia(data), hoje)
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

  // 3) REPOSIÇÃO DE ESTOQUE — peças que alguém avisou que estão acabando e
  // que ainda não viraram OP. UMA notificação agregada, e não uma por peça:
  // vinte peças acabando são um assunto só ("olhe a fila"), e vinte linhas
  // enterrariam as OPs atrasadas no sino.
  //
  // Só pra quem tem escrita em Ordens — quem decide produzir; o resumo volta
  // vazio pros outros. Some sozinha quando a fila de abertos esvazia.
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

  // 4) FIO ABAIXO DO MÍNIMO — uma notificação por COR, que é a unidade em
  // que se compra e em que se conta na prateleira.
  //
  // Só as cores com mínimo cadastrado entram: sem mínimo, ninguém disse que
  // essa cor faz falta, e várias das 24 cores do fornecedor são de peça que
  // não se faz mais. Inventar um limiar acenderia o sino de vinte cores no
  // dia em que isto subisse.
  //
  // Some sozinha quando entra lote: é derivada do saldo de agora, como as
  // outras três — não há linha de lembrete pra apagar.
  for (const f of fios) {
    const acabou = f.saldo <= 0
    notificacoes.push({
      id: `fio-${f.id}`,
      tipo: 'fio_abaixo_do_minimo',
      titulo: acabou
        ? `${f.nome}: fio acabou`
        : `${f.nome}: ${f.saldo} caixa${f.saldo === 1 ? '' : 's'} de fio`,
      descricao: acabou
        ? `Mínimo de ${f.minimo} caixas. Sem saldo em nenhuma partida.`
        : `Abaixo do mínimo de ${f.minimo} caixas.`,
      href: '/estoque-fios?tab=saldo',
      // Fio que ACABOU para máquina; abaixo do mínimo ainda dá tempo de
      // comprar. Mesma graduação das OPs e das parcelas.
      severidade: acabou ? 'critico' : 'aviso',
      referenciaEm: new Date(now),
    })
  }

  // 5) BACKUP — só admin (`undefined` = não é admin, não consultou). Aparece
  // APENAS quando não está em dia: backup em dia não pede nada, e um sino
  // aceso todo dia com "backup OK" deixaria de ser lido. O estado sai de
  // src/lib/backup.ts, o mesmo que o dashboard mostra.
  if (ultimoBackup !== undefined) {
    const estado = estadoDoBackup(ultimoBackup, new Date(now))
    if (estado !== 'em_dia') {
      const dias = ultimoBackup
        ? diasDesdeOBackup(ultimoBackup.feitoEm, new Date(now))
        : 0
      notificacoes.push({
        id: 'backup',
        tipo: 'backup',
        titulo:
          estado === 'nunca'
            ? 'Nenhum backup registrado'
            : estado === 'atrasado'
              ? `Backup atrasado: o último foi há ${dias} dia${dias === 1 ? '' : 's'}`
              : 'O último backup não chegou no Google Drive',
        descricao:
          estado === 'sem_drive'
            ? 'A cópia ficou só no computador da casa.'
            : 'Confira se o computador da casa está ligando o backup.',
        href: '/dashboard',
        // Sem backup (parado ou nunca feito) é crítico; feito mas só local
        // ainda é backup — aviso.
        severidade: estado === 'sem_drive' ? 'aviso' : 'critico',
        // O sino mostra "há X" disto: é o instante do último backup. Sem
        // registro nenhum, é agora — uma data inventada viraria "há 56 anos".
        referenciaEm: ultimoBackup?.feitoEm ?? new Date(now),
      })
    }
  }

  // Ordena por mais atrasado primeiro
  notificacoes.sort(
    (a, b) => a.referenciaEm.getTime() - b.referenciaEm.getTime(),
  )

  return notificacoes
}

function buscarParcelas(hoje: string) {
  return db
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
}



/**
 * As cores de fio abaixo do mínimo — UMA CONSULTA, e não uma por cor.
 *
 * O sino roda em toda tela aberta e a cada mudança de OP: um N+1 aqui seriam
 * 24 consultas por sino, vezes cada tela da fábrica. O saldo de cada lote sai
 * da mesma subconsulta correlacionada que a tela de fios usa
 * (`listarLotesFio`), somada por cor.
 *
 * ⚠️ A subconsulta precisa qualificar "lotes_fio"."id": interpolar a coluna
 * pelo Drizzle gera o identificador sem tabela, e como `movimentacoes_fio`
 * também tem `id`, o Postgres resolve pro escopo interno em vez de
 * correlacionar. Mesmo motivo comentado em estoque-fios/actions.ts.
 */
async function coresAbaixoDoMinimo(): Promise<
  { id: string; nome: string; minimo: number; saldo: number }[]
> {
  const saldoSql = sql<number>`COALESCE(SUM(${lotesFio.caixas} - (
    SELECT COALESCE(SUM(${movimentacoesFio.caixas}), 0)::int
    FROM ${movimentacoesFio}
    WHERE ${movimentacoesFio.loteId} = "lotes_fio"."id"
  )), 0)::int`

  const rows = await db
    .select({
      id: coresFornecedorFio.id,
      nome: coresFornecedorFio.nomeFornecedor,
      minimo: coresFornecedorFio.minimoCaixas,
      saldo: saldoSql,
    })
    .from(coresFornecedorFio)
    // LEFT JOIN, e não INNER: cor com mínimo e NENHUM lote é o caso mais
    // grave que existe — zero caixas —, e um inner join a esconderia.
    .leftJoin(
      lotesFio,
      and(
        eq(lotesFio.corFornecedorId, coresFornecedorFio.id),
        isNull(lotesFio.deletedAt),
      ),
    )
    .where(
      and(
        isNull(coresFornecedorFio.deletedAt),
        eq(coresFornecedorFio.ativo, true),
        isNotNull(coresFornecedorFio.minimoCaixas),
      ),
    )
    .groupBy(
      coresFornecedorFio.id,
      coresFornecedorFio.nomeFornecedor,
      coresFornecedorFio.minimoCaixas,
    )
    .having(sql`${saldoSql} < ${coresFornecedorFio.minimoCaixas}`)

  // A ordem e o corte ficam aqui: são poucas linhas (uma por cor com mínimo)
  // e ordenar por agregado no SQL exigiria repetir a expressão inteira.
  // Pior primeiro, e no máximo 10 — vinte cores acabando são um assunto só,
  // e enterrariam as OPs atrasadas no sino.
  return rows
    .filter((r): r is typeof r & { minimo: number } => r.minimo !== null)
    .sort((a, b) => a.saldo - b.saldo || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 10)
}
