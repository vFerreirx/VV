'use server'

import { and, asc, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { requireArea, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  condicaoDeVisaoDoOperador,
  estacaoDoOperador,
} from '@/lib/db/estacao-operadores'
import {
  apontamentosProducao,
  estacaoOperadores,
  estacoes,
  eventosKanban,
  maquinas,
  ordensProducao,
  produtos,
  remessasFull,
  users,
  variacoesProduto,
  type EventoKanban,
} from '@/lib/db/schema'
import type { MaquinaStatus } from '@/lib/producao/estado-maquina'
import { canalValues, statusValues } from '@/lib/validators/ordens'

// -----------------------------------------------------------------
// Tipo do card do kanban
// -----------------------------------------------------------------

export type KanbanCardData = {
  id: string
  numero: string
  status: (typeof statusValues)[number]
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  canalDestino: (typeof canalValues)[number]
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
  quantidade: number
  maquinaId: string | null
  maquinaCodigo: string | null
  maquinaNome: string | null
  // Remessa Full a que a OP pertence (vira "pasta" na coluna do kanban).
  remessaFullId: string | null
  remessaLabel: string | null
  responsavelId: string | null
  responsavelNome: string | null
  estacaoCor: string | null
  estacaoNome: string | null
  produzido: number
  // Peças perdidas, somadas dos apontamentos. Irmã de `produzido` e vinda da
  // mesma tabela — o painel do operador mostra as duas juntas, porque "142
  // de 300 prontas" sem o refugo ao lado esconde a diferença entre uma OP
  // rendendo bem e uma OP queimando material.
  refugo: number
  dataPrevistaFim: Date | null
  atrasada: boolean
  // Quando a OP entrou no status atual (pra mostrar "tempo na etapa").
  desdeStatus: Date
  observacoes: string | null
}

// -----------------------------------------------------------------
// Filtros do kanban
// -----------------------------------------------------------------

export type KanbanFiltros = {
  q?: string
  canal?: (typeof canalValues)[number] | 'todos'
  maquinaId?: string | 'todas'
  responsavelId?: string | 'todos'
}

export async function listarOrdensProducao(
  filtros: KanbanFiltros = {},
): Promise<KanbanCardData[]> {
  const user = await requireAuth()

  const conditions = [
    isNull(ordensProducao.deletedAt),
    // Cancelado e enviado (concluído) ficam fora do kanban — concluídas
    // aparecem em Ordens com o filtro "Concluídas".
    ne(ordensProducao.status, 'cancelado'),
    ne(ordensProducao.status, 'enviado'),
  ]

  // O operador enxerga a fila comum + a estação dele. A regra mora em
  // src/lib/db/estacao-operadores.ts porque ela vale IGUAL aqui e na lista
  // de /ordens — eram duas cópias da versão antiga, e divergir faria a OP
  // aparecer no board e sumir da lista. Os demais cargos veem tudo.
  if (user.role === 'operador') {
    conditions.push(await condicaoDeVisaoDoOperador(user.id))
  }

  if (filtros.q && filtros.q.trim().length > 0) {
    const term = `%${filtros.q.trim()}%`
    conditions.push(
      or(
        ilike(ordensProducao.numero, term),
        ilike(produtos.nome, term),
        ilike(produtos.sku, term),
      )!,
    )
  }
  if (filtros.canal && filtros.canal !== 'todos') {
    conditions.push(eq(ordensProducao.canalDestino, filtros.canal))
  }
  if (filtros.maquinaId && filtros.maquinaId !== 'todas') {
    conditions.push(eq(ordensProducao.maquinaId, filtros.maquinaId))
  }
  if (filtros.responsavelId && filtros.responsavelId !== 'todos') {
    conditions.push(eq(ordensProducao.responsavelId, filtros.responsavelId))
  }

  // Estação via máquina (rota principal) e via responsável (fallback).
  const estMaq = alias(estacoes, 'est_maq')
  const estResp = alias(estacoes, 'est_resp')

  const rows = await db
    .select({
      op: ordensProducao,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      responsavelNome: users.nome,
      maquinaCodigo: maquinas.codigo,
      maquinaNome: maquinas.nome,
      remessaCanal: remessasFull.canal,
      remessaDataEnvio: remessasFull.dataEnvio,
      estacaoCorMaq: estMaq.cor,
      estacaoNomeMaq: estMaq.nome,
      estacaoCorResp: estResp.cor,
      estacaoNomeResp: estResp.nome,
      // Qualifica "ordens_producao"."id" nas duas subqueries abaixo — sem
      // isso o Postgres correlaciona com o `id` da própria subquery
      // (apontamentos_producao / eventos_kanban) e o valor nunca bate
      // (produzido sempre 0, desdeStatus sempre null).
      produzido: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
      // Espelha a subquery de cima, inclusive o `"ordens_producao"."id"`
      // qualificado à mão — sem isso o Postgres correlaciona com o `id` da
      // própria subquery e o refugo sai sempre 0, igual ao bug que o
      // comentário acima descreve.
      refugo: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeRefugo}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
      // Última entrada no status atual (pra calcular tempo na etapa).
      desdeStatus: sql<string | null>`(
        SELECT MAX(${eventosKanban.createdAt})
        FROM ${eventosKanban}
        WHERE ${eventosKanban.ordemId} = "ordens_producao"."id"
          AND ${eventosKanban.statusNovo} = ${ordensProducao.status}
      )`,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    .leftJoin(
      estMaq,
      and(eq(estMaq.id, maquinas.estacaoId), isNull(estMaq.deletedAt)),
    )
    // Estacao pelo RESPONSAVEL, via estacao_operadores. Antes isto casava
    // com operador_dia_id/operador_noite_id, que viraram legado no item B e
    // nunca mais recebem escrita — o fallback tinha parado de funcionar em
    // silencio pra toda estacao cadastrada na tela nova.
    //
    // Duas leftJoin encadeadas, e nao uma com OR: e o
    // `UNIQUE (operador_id)` que garante no maximo UMA linha aqui. Sem ele o
    // card duplicaria na coluna.
    .leftJoin(
      estacaoOperadores,
      eq(estacaoOperadores.operadorId, ordensProducao.responsavelId),
    )
    .leftJoin(
      estResp,
      and(
        eq(estResp.id, estacaoOperadores.estacaoId),
        isNull(estResp.deletedAt),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      // Enum ordem_prioridade é declarado ['baixa','normal','alta','urgente']
      // — Postgres ordena enum pela ordem de declaração, não alfabética.
      // DESC traz urgente/alta primeiro (mais importante no topo da coluna).
      desc(ordensProducao.prioridade),
      asc(ordensProducao.dataPrevistaFim),
    )

  const now = Date.now()
  return rows.map(
    ({
      op,
      produtoNome,
      produtoSku,
      variacaoCor,
      variacaoModelo,
      variacaoTamanho,
      responsavelNome,
      maquinaCodigo,
      maquinaNome,
      remessaCanal,
      remessaDataEnvio,
      estacaoCorMaq,
      estacaoNomeMaq,
      estacaoCorResp,
      estacaoNomeResp,
      produzido,
      refugo,
      desdeStatus,
    }) => ({
      id: op.id,
      numero: op.numero,
      status: op.status,
      prioridade: op.prioridade,
      canalDestino: op.canalDestino,
      produtoNome,
      produtoSku,
      variacaoCor: variacaoCor ?? null,
      variacaoModelo: variacaoModelo ?? null,
      variacaoTamanho: variacaoTamanho ?? null,
      quantidade: op.quantidade,
      maquinaId: op.maquinaId,
      maquinaCodigo: maquinaCodigo ?? null,
      maquinaNome: maquinaNome ?? null,
      remessaFullId: op.remessaFullId,
      remessaLabel:
        remessaCanal && remessaDataEnvio
          ? `${remessaCanal === 'full_ml' ? 'Full ML' : 'Full Shopee'} · ${remessaDataEnvio.slice(8, 10)}/${remessaDataEnvio.slice(5, 7)}`
          : null,
      responsavelId: op.responsavelId,
      responsavelNome: responsavelNome ?? null,
      estacaoCor: estacaoCorMaq ?? estacaoCorResp ?? null,
      estacaoNome: estacaoNomeMaq ?? estacaoNomeResp ?? null,
      produzido: produzido ?? 0,
      refugo: refugo ?? 0,
      dataPrevistaFim: op.dataPrevistaFim,
      atrasada:
        op.dataPrevistaFim !== null &&
        op.status !== 'enviado' &&
        new Date(op.dataPrevistaFim).getTime() < now,
      desdeStatus: desdeStatus
        ? new Date(desdeStatus)
        : (op.updatedAt ?? op.createdAt),
      observacoes: op.observacoes,
    }),
  )
}

// -----------------------------------------------------------------
// A ESTAÇÃO VISTA POR MÁQUINA — a tela do operador
// -----------------------------------------------------------------
//
// `listarOrdensProducao` acima devolve ORDENS. Esta devolve MÁQUINAS, e a
// diferença é o desenho inteiro da tela do operador: uma lista de OPs cresce
// com a fila (100 OPs esperando = 100 cards), uma lista de máquinas não —
// são 9 na Estação 1 e 7 na Estação 2, hoje e com a fila cheia.
//
// A OP vem PENDURADA na máquina, e só a que está `em_producao`. É o mesmo
// recorte do índice único `ordens_producao_maquina_em_producao_uidx`
// (migration 50), então o LEFT JOIN não tem como duplicar a linha da máquina:
// existe no máximo uma OP em produção por máquina, garantido pelo banco.
//
// ⚠️ A ESTAÇÃO É RESOLVIDA AQUI, do usuário autenticado — nunca recebida por
// parâmetro. Este arquivo é 'use server': um `estacaoId` vindo de fora seria
// aceito de qualquer cliente e leria as máquinas (e as OPs) da estação
// alheia. Quem pergunta só pode receber a própria.

export type OpNaMaquina = {
  id: string
  numero: string
  produtoNome: string
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
  /** A META da OP, em peças — o que a tela mostra como "Meta: X peças". */
  quantidade: number
  /**
   * Já registrado em apontamentos. No fluxo novo isto é 0 até a conclusão;
   * fica aqui pra OP legada, que tem apontamento e não pode perder o número.
   */
  produzido: number
  refugo: number
  responsavelId: string | null
  responsavelNome: string | null
  observacoes: string | null
}

export type MaquinaDaEstacao = {
  id: string
  codigo: string
  nome: string
  status: MaquinaStatus
  /** A OP em produção nesta máquina, ou null. No máximo uma — ver acima. */
  op: OpNaMaquina | null
}

export type VisaoDaEstacao = {
  estacao: { id: string; nome: string } | null
  maquinas: MaquinaDaEstacao[]
}

export async function listarMaquinasDaEstacao(): Promise<VisaoDaEstacao> {
  // `requireArea`, e não `requireAuth`: o arquivo é 'use server', então esta
  // função é um endpoint mesmo só sendo chamada pela página — e a página já
  // exige a área. Sem isto, quem tem 'kanban' em `nenhum` teria a tela
  // fechada e a leitura aberta, que é a porta dos fundos exata que
  // /permissoes promete não existir.
  const user = await requireArea('kanban')

  const estacao = await estacaoDoOperador(user.id)
  // Sem estação não há máquinas pra mostrar — e a tela vira o aviso, não uma
  // grade vazia. Admin e gerente também caem aqui (não têm estação), mas
  // nenhum dos dois usa esta visão: eles vão pro kanban.
  if (!estacao) return { estacao: null, maquinas: [] }

  const rows = await db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      status: maquinas.status,
      opId: ordensProducao.id,
      opNumero: ordensProducao.numero,
      opQuantidade: ordensProducao.quantidade,
      opObservacoes: ordensProducao.observacoes,
      opResponsavelId: ordensProducao.responsavelId,
      responsavelNome: users.nome,
      produtoNome: produtos.nome,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      // Mesma correlação qualificada à mão de `listarOrdensProducao`, e pelo
      // mesmo motivo: sem `"ordens_producao"."id"` explícito o Postgres
      // correlaciona com o `id` da própria subquery e o total sai sempre 0.
      produzido: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
      refugo: sql<number>`(
        SELECT COALESCE(SUM(${apontamentosProducao.quantidadeRefugo}), 0)::int
        FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
    })
    .from(maquinas)
    .leftJoin(
      ordensProducao,
      and(
        eq(ordensProducao.maquinaId, maquinas.id),
        // SÓ `em_producao` — o mesmo predicado do índice único. É o único
        // status em que a OP está FISICAMENTE na máquina; `pronto_envio`
        // libera de propósito, senão as máquinas iriam ficando "ocupadas"
        // sem ninguém produzindo e a estação travaria sozinha.
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .leftJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .where(and(eq(maquinas.estacaoId, estacao.id), isNull(maquinas.deletedAt)))
    // POSIÇÃO ESTÁVEL. O cartão da TC-01 é sempre o primeiro, ocupada ou
    // livre: quem trabalha aqui aprende a estação pela posição, e uma grade
    // que se reordena quando uma OP começa obriga a reler tudo toda vez.
    .orderBy(asc(maquinas.codigo))

  return {
    estacao: { id: estacao.id, nome: estacao.nome },
    maquinas: rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nome: r.nome,
      status: r.status,
      op:
        r.opId === null
          ? null
          : {
              id: r.opId,
              numero: r.opNumero!,
              produtoNome: r.produtoNome ?? '—',
              variacaoCor: r.variacaoCor ?? null,
              variacaoModelo: r.variacaoModelo ?? null,
              variacaoTamanho: r.variacaoTamanho ?? null,
              quantidade: r.opQuantidade!,
              produzido: r.produzido ?? 0,
              refugo: r.refugo ?? 0,
              responsavelId: r.opResponsavelId,
              responsavelNome: r.responsavelNome ?? null,
              observacoes: r.opObservacoes,
            },
    })),
  }
}

// -----------------------------------------------------------------
// Histórico de eventos (pra side sheet)
// -----------------------------------------------------------------

export type EventoKanbanComUsuario = EventoKanban & {
  usuarioNome: string | null
}

export async function listarEventosOrdem(
  ordemId: string,
): Promise<EventoKanbanComUsuario[]> {
  await requireAuth()
  const rows = await db
    .select({
      evento: eventosKanban,
      usuarioNome: users.nome,
    })
    .from(eventosKanban)
    .leftJoin(users, eq(users.id, eventosKanban.usuarioId))
    .where(eq(eventosKanban.ordemId, ordemId))
    .orderBy(desc(eventosKanban.createdAt))

  return rows.map(({ evento, usuarioNome }) => ({
    ...evento,
    usuarioNome: usuarioNome ?? null,
  }))
}
