'use server'

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { requireArea, requireAuth } from '@/lib/auth/require-auth'
import { PRIORIDADE_NIVEIS, type PrioridadeNivel } from '@/lib/prioridade'
import { db } from '@/lib/db'
import {
  condicaoDeVisaoDoOperador,
  estacaoDoOperador,
} from '@/lib/db/estacao-operadores'
import {
  apontamentosProducao,
  cores,
  maquinaParadas,
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
import {
  destinoDaOrdem,
  type DestinoNaEstacao,
  type StatusDaOrdem,
} from '@/lib/producao/destino-da-ordem'
import type { MaquinaStatus } from '@/lib/producao/estado-maquina'
import { STATUS_QUE_INICIAM } from '@/lib/producao/inicio-da-op'
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
  //
  // ⚠️ NULO QUANDO NÃO HÁ TRANSIÇÃO REGISTRADA, e o card então não mostra
  // relógio. Não existe valor "aproximado" que sirva: o `updatedAt` que
  // entrava aqui muda em qualquer edição (trocar a observação zerava o
  // aging), e um relógio que zera sozinho é pior do que relógio nenhum —
  // esconde justamente a OP parada há mais tempo.
  desdeStatus: Date | null
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
    // Cancelado e enviado (com baixa) ficam fora do kanban — as com baixa
    // aparecem em Ordens com o filtro "Com baixa".
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
      // Última ENTRADA no status atual (pra calcular tempo na etapa).
      //
      // ⚠️ SÓ TRANSIÇÃO CONTA. `pegarOrdemAction` grava de propósito um
      // evento `em_producao` -> `em_producao` quando a OP que já estava em
      // produção só GANHA MÁQUINA — o histórico precisa dele, porque a OP
      // mudou de lugar no chão de fábrica. Mas ela não ENTROU em produção
      // de novo, e contar esse evento zerava o relógio de uma OP que podia
      // estar parada há dias.
      //
      // `IS DISTINCT FROM` e não `<>`: o evento de criação tem
      // `status_anterior` NULO, e `NULL <> 'programado'` é NULL — o `<>`
      // descartaria justamente a entrada da OP na primeira coluna, e toda OP
      // que nunca foi movida ficaria sem relógio.
      //
      // O filtro é SÓ AQUI. As leituras de histórico (`listarEventosOrdem`
      // e `historicoDaOrdem`) continuam mostrando o evento sem transição.
      desdeStatus: sql<string | null>`(
        SELECT MAX(${eventosKanban.createdAt})
        FROM ${eventosKanban}
        WHERE ${eventosKanban.ordemId} = "ordens_producao"."id"
          AND ${eventosKanban.statusNovo} = ${ordensProducao.status}
          AND ${eventosKanban.statusAnterior} IS DISTINCT FROM ${eventosKanban.statusNovo}
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
      // Sem fallback de propósito — ver o comentário do tipo.
      desdeStatus: desdeStatus ? new Date(desdeStatus) : null,
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
  /**
   * O hex da cor, pro swatch do cartão. Mesmo JOIN por nome da fila de
   * escolha (`cores.nome` = `variacoes_produto.cor`), e pelo mesmo motivo:
   * as duas telas mostram A MESMA OP com meia hora de diferença, e conferir
   * se pegou a certa não pode exigir tradução.
   */
  corHex: string | null
  corHex2: string | null
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
  /**
   * A parada ABERTA, quando existe — é dela que sai a manchete "Parada: falta
   * de fio · há 2 h" no lugar do genérico "Em manutenção". Mesmo join de
   * `listarMaquinas` (maquinas/actions.ts), e pelo mesmo motivo: o índice
   * parcial `maquina_paradas_aberta_uidx` garante no máximo uma por máquina,
   * então a linha da máquina não duplica.
   */
  paradaAberta: {
    iniciadaEm: Date
    motivo: string | null
    observacaoAbertura: string | null
  } | null
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
      corHex: cores.codigoHex,
      corHex2: cores.codigoHex2,
      paradaIniciadaEm: maquinaParadas.iniciadaEm,
      paradaMotivo: maquinaParadas.motivo,
      paradaObservacao: maquinaParadas.observacaoAbertura,
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
    .leftJoin(cores, eq(cores.nome, variacoesProduto.cor))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .leftJoin(
      maquinaParadas,
      and(
        eq(maquinaParadas.maquinaId, maquinas.id),
        isNull(maquinaParadas.encerradaEm),
      ),
    )
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
              corHex: r.corHex ?? null,
              corHex2: r.corHex2 ?? null,
              quantidade: r.opQuantidade!,
              produzido: r.produzido ?? 0,
              refugo: r.refugo ?? 0,
              responsavelId: r.opResponsavelId,
              responsavelNome: r.responsavelNome ?? null,
              observacoes: r.opObservacoes,
            },
      paradaAberta:
        r.paradaIniciadaEm === null
          ? null
          : {
              iniciadaEm: r.paradaIniciadaEm,
              motivo: r.paradaMotivo,
              observacaoAbertura: r.paradaObservacao,
            },
    })),
  }
}

// -----------------------------------------------------------------
// A FILA DE UMA MÁQUINA — o diálogo de "Iniciar produção"
// -----------------------------------------------------------------
//
// A única consulta desta tela que PAGINA de verdade, no SQL. As outras
// respondem "quantas?" ou listam o que já está na estação; esta é a que o
// operador percorre procurando, e é a que cresce sem limite.
//
// ⚠️ A MÁQUINA VEM POR PARÂMETRO E É VALIDADA CONTRA A ESTAÇÃO DELE. A
// estação, nunca — sai do usuário autenticado. Sem a validação, mandar um
// `maquinaId` de fora viraria um jeito de ler a fila da estação alheia por
// chamada direta à action (o arquivo é 'use server': ela é endpoint).
//
// O filtro de status vem de `STATUS_QUE_INICIAM`, a MESMA lista que
// `pegarOrdemAction` aceita. Divergir aqui produz um de dois estragos: a
// tela oferece o que o servidor recusa (toque que só dá erro), ou o servidor
// aceita o que a tela nunca mostra.

const OPS_POR_PAGINA = 20

export type OpParaIniciar = {
  id: string
  numero: string
  status: StatusDaOrdem
  prioridade: PrioridadeNivel
  produtoNome: string
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
  quantidade: number
  observacoes: string | null
  /**
   * O hex da cor, pro swatch da fila. Vem de um JOIN por NOME entre
   * `variacoes_produto.cor` (texto, preserva histórico) e `cores.nome` —
   * não há FK entre as duas de propósito, pra que renomear uma cor não
   * reescreva o que a variação registrou.
   *
   * Hoje as 466 variações do catálogo casam e têm hex. Quando não casar, o
   * swatch vira o quadrado tracejado de "sem cor definida" e a linha
   * continua legível pelo texto — degradar assim é o motivo de o JOIN ser
   * LEFT e de o campo ser nulo.
   */
  corHex: string | null
  corHex2: string | null
  /** Pro "vence HOJE" — a fila é ordenada por ele e ele era invisível. */
  dataPrevistaFim: Date | null
}

export type PaginaDeOps = {
  ops: OpParaIniciar[]
  total: number
  temMais: boolean
}

export async function listarOpsParaIniciar(
  maquinaId: string,
  filtros: { q?: string; pagina?: number } = {},
): Promise<PaginaDeOps> {
  const user = await requireArea('kanban')

  const estacao = await estacaoDoOperador(user.id)
  if (!estacao) return { ops: [], total: 0, temMais: false }

  // A máquina precisa ser DESTA estação. `listarMaquinasDaEstacao` só
  // desenha cartões daqui, mas esta função não pode confiar na tela.
  const [maquina] = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(
      and(
        eq(maquinas.id, maquinaId),
        eq(maquinas.estacaoId, estacao.id),
        isNull(maquinas.deletedAt),
      ),
    )
    .limit(1)
  if (!maquina) return { ops: [], total: 0, temMais: false }

  const pagina = Math.max(1, filtros.pagina ?? 1)
  const termo = filtros.q?.trim() ?? ''

  const conditions = [
    isNull(ordensProducao.deletedAt),
    inArray(ordensProducao.status, STATUS_QUE_INICIAM),
    // SEM DONO. OP que já é de alguém não se "inicia" de novo — e
    // `pegarOrdemAction` recusaria, então oferecê-la seria um toque que só
    // devolve erro. Ela continua visível na consulta "Fila".
    isNull(ordensProducao.responsavelId),
    // SEM MÁQUINA, ou já apontada PRA ESTA. Uma OP destinada à TC-05
    // iniciaria na TC-05 mesmo tocada aqui, porque `pegarOrdemAction` usa
    // `atual.maquinaId ?? maquinaId` — e o operador veria este cartão
    // continuar livre sem entender por quê.
    or(
      isNull(ordensProducao.maquinaId),
      eq(ordensProducao.maquinaId, maquinaId),
    )!,
  ]
  if (termo.length > 0) {
    conditions.push(
      or(
        ilike(ordensProducao.numero, `%${termo}%`),
        ilike(produtos.nome, `%${termo}%`),
        ilike(produtos.sku, `%${termo}%`),
      )!,
    )
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(and(...conditions))

  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      status: ordensProducao.status,
      prioridade: ordensProducao.prioridade,
      quantidade: ordensProducao.quantidade,
      observacoes: ordensProducao.observacoes,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      produtoNome: produtos.nome,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      corHex: cores.codigoHex,
      corHex2: cores.codigoHex2,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(cores, eq(cores.nome, variacoesProduto.cor))
    .where(and(...conditions))
    // A MESMA ORDEM DO KANBAN, e de propósito: o enum `ordem_prioridade` é
    // declarado baixa < normal < alta < urgente, então DESC traz urgente
    // primeiro sem CASE nenhum. Prazo em ASC deixa NULL por último, que é o
    // que se quer — OP sem prazo não fura fila de OP com prazo.
    .orderBy(
      desc(ordensProducao.prioridade),
      asc(ordensProducao.dataPrevistaFim),
    )
    .limit(OPS_POR_PAGINA)
    .offset((pagina - 1) * OPS_POR_PAGINA)

  return {
    ops: rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      status: r.status,
      prioridade: r.prioridade,
      produtoNome: r.produtoNome,
      variacaoCor: r.variacaoCor ?? null,
      variacaoModelo: r.variacaoModelo ?? null,
      variacaoTamanho: r.variacaoTamanho ?? null,
      quantidade: r.quantidade,
      observacoes: r.observacoes,
      corHex: r.corHex ?? null,
      corHex2: r.corHex2 ?? null,
      dataPrevistaFim: r.dataPrevistaFim,
    })),
    total,
    temMais: pagina * OPS_POR_PAGINA < total,
  }
}

// -----------------------------------------------------------------
// OS DOIS CONTADORES E AS DUAS CONSULTAS — fila e terminadas
// -----------------------------------------------------------------
//
// ⚠️ POR QUE NÃO É `listarOrdensProducao()` DIRETO. Era: a tela do operador
// carregava a lista COMPLETA — 25 colunas, 7 joins e três subqueries
// correlacionadas por linha — pra depois usar dois números dela. A área
// visível não crescia com a fila (esse era o ponto da Fase 1), mas os DADOS
// cresciam: com cem OPs esperando, cem linhas caras a cada render de uma
// tela que mostra dois contadores.
//
// Agora a leitura é em dois tempos, e o caro só acontece quando alguém pede:
//
//   1. uma consulta MAGRA (cinco colunas, zero join, zero subquery) que
//      responde "quais OPs, em que status, em que máquina" — é dela que
//      saem os contadores;
//   2. os campos de exibição só pra PÁGINA que o operador abriu, no máximo
//      OPS_POR_PAGINA linhas.
//
// ⚠️ E O BUCKET CONTINUA SENDO `destinoDaOrdem`, em TypeScript, e não um
// WHERE equivalente em SQL. Escrever a regra de novo em SQL é exatamente o
// que a Fase 1 tirou do caminho: seriam duas cópias, e a que diverge some
// com OP da tela sem erro nenhum. A consulta magra existe pra que dê pra
// aplicar a regra única sem pagar caro por isso.

type OrdemMagra = {
  id: string
  status: StatusDaOrdem
  maquinaId: string | null
  prioridade: PrioridadeNivel
  dataPrevistaFim: Date | null
}

/** As OPs que o operador enxerga, agrupadas pelo destino na tela dele. */
async function opsPorDestino(
  userId: string,
): Promise<Map<DestinoNaEstacao, OrdemMagra[]>> {
  const estacao = await estacaoDoOperador(userId)

  // As máquinas da estação. É o que decide `estaNumaMaquinaDaEstacao` sem
  // adivinhação: sem esta lista, "está no cartão?" viraria a inferência
  // "em_producao e tem máquina", que só é verdade por causa de um filtro
  // que mora noutro arquivo.
  const idsDeMaquinas = estacao
    ? new Set(
        (
          await db
            .select({ id: maquinas.id })
            .from(maquinas)
            .where(
              and(
                eq(maquinas.estacaoId, estacao.id),
                isNull(maquinas.deletedAt),
              ),
            )
        ).map((m) => m.id),
      )
    : new Set<string>()

  const rows = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      maquinaId: ordensProducao.maquinaId,
      prioridade: ordensProducao.prioridade,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
    })
    .from(ordensProducao)
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        await condicaoDeVisaoDoOperador(userId),
      ),
    )

  const porDestino = new Map<DestinoNaEstacao, OrdemMagra[]>()
  for (const r of rows) {
    // No cartão da máquina só entra a OP EM PRODUÇÃO — o mesmo recorte do
    // índice único da migration 50 e do LEFT JOIN de
    // `listarMaquinasDaEstacao`. Uma OP `pronto_envio` que ainda carrega a
    // máquina antiga não está mais lá.
    const naMaquina =
      r.status === 'em_producao' &&
      r.maquinaId !== null &&
      idsDeMaquinas.has(r.maquinaId)
    const destino = destinoDaOrdem(r.status, naMaquina)
    const lista = porDestino.get(destino) ?? []
    lista.push(r)
    porDestino.set(destino, lista)
  }
  return porDestino
}

// A mesma ordem do kanban e do diálogo de iniciar: urgente primeiro, depois
// o prazo mais apertado. Aqui é em TypeScript porque o bucket também é.
function ordenarComoOKanban(a: OrdemMagra, b: OrdemMagra): number {
  const p =
    PRIORIDADE_NIVEIS.indexOf(b.prioridade) -
    PRIORIDADE_NIVEIS.indexOf(a.prioridade)
  if (p !== 0) return p
  // Sem prazo vai por último, como o NULLS LAST do ASC no Postgres.
  const prazoA = a.dataPrevistaFim?.getTime() ?? Infinity
  const prazoB = b.dataPrevistaFim?.getTime() ?? Infinity
  return prazoA - prazoB
}

export type ContagensDaEstacao = { fila: number; terminadas: number }

export async function contarOpsDaEstacao(): Promise<ContagensDaEstacao> {
  const user = await requireArea('kanban')
  const porDestino = await opsPorDestino(user.id)
  return {
    fila: porDestino.get('fila')?.length ?? 0,
    terminadas: porDestino.get('terminadas')?.length ?? 0,
  }
}

// A consulta de "Terminadas" É a lista de últimas conclusões — e não um
// terceiro botão no cabeçalho. Ela já responde "o que eu entreguei"; faltava
// dizer QUANDO, QUANTO e QUEM, que é a mesma informação que responde "será
// que salvou mesmo?" depois que o toast sumiu. Duas perguntas, uma lista.
export type OpDaConsulta = OpParaIniciar & {
  maquinaCodigo: string | null
  /** Só preenchido em 'terminadas'. */
  concluidaEm: Date | null
  concluidaPor: string | null
  /** O texto que a conclusão gravou: total, diferença, refugo, quem iniciou. */
  resumo: string | null
  produzido: number
  refugo: number
  /**
   * A OP ainda está em `pronto_envio` E a máquina dela está livre? As duas
   * guardas de `desfazerConclusaoAction`, calculadas aqui pra que o botão
   * não apareça só pra devolver erro. Quem recusa de verdade é a action.
   */
  podeDesfazer: boolean
}

export type PaginaDaConsulta = {
  ops: OpDaConsulta[]
  total: number
  temMais: boolean
}

/** Uma página da fila ou das terminadas — só leitura, fora da área principal. */
export async function listarOpsDaEstacao(
  destino: 'fila' | 'terminadas',
  pagina = 1,
): Promise<PaginaDaConsulta> {
  const user = await requireArea('kanban')

  const todas = (await opsPorDestino(user.id)).get(destino) ?? []

  // AS CONCLUSÕES VÊM DO HISTÓRICO, e ordenam a lista. "Terminadas" ordenada
  // por prioridade responderia "o que é mais urgente do que já saiu da
  // máquina", que não é pergunta de ninguém. Por hora de conclusão, a de
  // cima é a que ele acabou de fazer — que é o que ele foi conferir.
  const conclusoes =
    destino === 'terminadas'
      ? await conclusoesDe(todas.map((o) => o.id))
      : new Map<string, DadosDaConclusao>()

  if (destino === 'terminadas') {
    todas.sort((a, b) => {
      const ta = conclusoes.get(a.id)?.em?.getTime() ?? 0
      const tb = conclusoes.get(b.id)?.em?.getTime() ?? 0
      return tb - ta
    })
  } else {
    todas.sort(ordenarComoOKanban)
  }

  // Máquinas ocupadas agora — a segunda guarda do desfazer.
  const maquinasOcupadas =
    destino === 'terminadas' ? await idsDeMaquinasOcupadas() : new Set<string>()

  const inicio = Math.max(0, pagina - 1) * OPS_POR_PAGINA
  const daPagina = todas.slice(inicio, inicio + OPS_POR_PAGINA)
  if (daPagina.length === 0) {
    return { ops: [], total: todas.length, temMais: false }
  }

  // Os campos de exibição só pras linhas desta página. `inArray` não
  // preserva ordem, então a ordenação volta pelo índice logo abaixo.
  const ordemDoId = new Map(daPagina.map((o, i) => [o.id, i]))
  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      status: ordensProducao.status,
      prioridade: ordensProducao.prioridade,
      quantidade: ordensProducao.quantidade,
      observacoes: ordensProducao.observacoes,
      produtoNome: produtos.nome,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      corHex: cores.codigoHex,
      corHex2: cores.codigoHex2,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      maquinaId: ordensProducao.maquinaId,
      maquinaCodigo: maquinas.codigo,
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
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(cores, eq(cores.nome, variacoesProduto.cor))
    .where(
      inArray(
        ordensProducao.id,
        daPagina.map((o) => o.id),
      ),
    )

  return {
    ops: rows
      .sort((a, b) => ordemDoId.get(a.id)! - ordemDoId.get(b.id)!)
      .map((r) => {
        const c = conclusoes.get(r.id)
        return {
          id: r.id,
          numero: r.numero,
          status: r.status,
          prioridade: r.prioridade,
          produtoNome: r.produtoNome,
          variacaoCor: r.variacaoCor ?? null,
          variacaoModelo: r.variacaoModelo ?? null,
          variacaoTamanho: r.variacaoTamanho ?? null,
          quantidade: r.quantidade,
          observacoes: r.observacoes,
          corHex: r.corHex ?? null,
          corHex2: r.corHex2 ?? null,
          dataPrevistaFim: r.dataPrevistaFim,
          maquinaCodigo: r.maquinaCodigo ?? null,
          concluidaEm: c?.em ?? null,
          concluidaPor: c?.por ?? null,
          resumo: c?.resumo ?? null,
          produzido: r.produzido ?? 0,
          refugo: r.refugo ?? 0,
          podeDesfazer:
            destino === 'terminadas' &&
            r.status === 'pronto_envio' &&
            r.maquinaId !== null &&
            !maquinasOcupadas.has(r.maquinaId),
        }
      }),
    total: todas.length,
    temMais: inicio + daPagina.length < todas.length,
  }
}

type DadosDaConclusao = {
  em: Date
  por: string | null
  resumo: string | null
}

/** Quem concluiu cada OP, quando, e o que ficou escrito. Uma consulta só. */
async function conclusoesDe(
  ids: string[],
): Promise<Map<string, DadosDaConclusao>> {
  const mapa = new Map<string, DadosDaConclusao>()
  if (ids.length === 0) return mapa

  const rows = await db
    .select({
      ordemId: eventosKanban.ordemId,
      em: eventosKanban.createdAt,
      por: users.nome,
      resumo: eventosKanban.observacao,
    })
    .from(eventosKanban)
    .leftJoin(users, eq(users.id, eventosKanban.usuarioId))
    .where(
      and(
        inArray(eventosKanban.ordemId, ids),
        eq(eventosKanban.statusNovo, 'pronto_envio'),
      ),
    )
    .orderBy(desc(eventosKanban.createdAt))

  // Ordenado do mais novo pro mais velho: o primeiro de cada OP é a
  // conclusão que vale. Uma OP desfeita e concluída de novo tem duas.
  for (const r of rows) {
    if (!mapa.has(r.ordemId)) {
      mapa.set(r.ordemId, { em: r.em, por: r.por, resumo: r.resumo })
    }
  }
  return mapa
}

/** Máquinas com OP em produção agora — o que impede o desfazer. */
async function idsDeMaquinasOcupadas(): Promise<Set<string>> {
  const rows = await db
    .select({ id: ordensProducao.maquinaId })
    .from(ordensProducao)
    .where(
      and(
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
  return new Set(rows.map((r) => r.id).filter((id) => id !== null))
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
