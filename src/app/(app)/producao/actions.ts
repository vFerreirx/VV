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
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  listarMaquinasParaOrdem,
  listarResponsaveis,
} from '@/app/(app)/ordens/actions'
import { isManager, requireArea, requireAuth } from '@/lib/auth/require-auth'
import { PRIORIDADE_NIVEIS, type PrioridadeNivel } from '@/lib/prioridade'
import { db } from '@/lib/db'
import {
  concluidaDesdeSql,
  concluidaEmSql,
  marcosDasOps,
  type MarcosDaOp,
} from '@/lib/db/conclusao-da-op'
import {
  apontamentosProducao,
  contasMarketplace,
  cores,
  maquinaParadas,
  estacoes,
  eventosKanban,
  maquinas,
  orcamentos,
  ordensProducao,
  produtos,
  remessasFull,
  users,
  variacoesProduto,
  type EventoKanban,
} from '@/lib/db/schema'
import {
  concluidaNaJanela,
  destinoDaOrdem,
  inicioDaJanela,
  type DestinoNaEstacao,
  type StatusDaOrdem,
} from '@/lib/producao/destino-da-ordem'
import {
  desfazerAlcanca,
  posicaoNoMesmoInstante,
} from '@/lib/producao/transicoes-da-op'
import { producaoAtrasada } from '@/lib/producao/atraso-da-op'
import {
  rotuloDaRemessa,
  rotuloDoBlocoDeDestino,
  rotuloDoDestino,
} from '@/lib/producao/prazo-da-remessa'
import { erroDoAutorDoDesfazer } from '@/lib/producao/conclusao'
import type { MaquinaStatus } from '@/lib/producao/estado-maquina'
import { tamanhoUnicoSql } from '@/lib/db/tamanho-unico'
import { STATUS_QUE_INICIAM } from '@/lib/producao/inicio-da-op'
import {
  terminadaNaTela,
  type TelaDoTablet,
} from '@/lib/producao/tela-do-tablet'
import { canalValues, statusValues } from '@/lib/validators/ordens'

// -----------------------------------------------------------------
// A linha do Trello: código, tamanho único e destino
// -----------------------------------------------------------------
//
// O que o tablet precisa pra ler a OP como o chão de fábrica lê
// (`linhaDaOp`, src/lib/producao/rotulo-da-op.ts) e pra dizer pra onde ela vai
// (`rotuloDoDestino`, src/lib/producao/prazo-da-remessa.ts). O tamanho único
// é `tamanhoUnicoSql` (src/lib/db/tamanho-unico.ts), o mesmo de /ordens.

type ColunasDoDestino = {
  canal: string
  remessaCanal: string | null
  remessaDataEnvio: string | null
  remessaContaNome: string | null
  pedidoNumero: number | null
  /** Só as consultas do "Iniciar" e da Fila trazem — é do cabeçalho do bloco. */
  pedidoCliente?: string | null
}

function destinoDaLinha(r: ColunasDoDestino) {
  return {
    canal: r.canal,
    remessa:
      r.remessaCanal && r.remessaDataEnvio
        ? {
            canal: r.remessaCanal,
            dataEnvio: r.remessaDataEnvio,
            contaNome: r.remessaContaNome,
          }
        : null,
    pedidoNumero: r.pedidoNumero,
    pedidoCliente: r.pedidoCliente ?? null,
  }
}

/** O destino, a partir das colunas do LEFT JOIN em remessa, conta e pedido. */
function destinoDe(r: ColunasDoDestino): string {
  return rotuloDoDestino(destinoDaLinha(r))
}

/**
 * O cabeçalho do bloco no "Iniciar": "Full ML · Conta 1 · envio 29/09",
 * "Pedido #142 · Loja Bela".
 */
function destinoBlocoDe(r: ColunasDoDestino): string {
  return rotuloDoBlocoDeDestino(destinoDaLinha(r))
}

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
  /** O código do programa ("059"), ou null — o gerente também lê por ele. */
  produtoCodigo: string | null
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
  await requireAuth()

  const conditions = [
    isNull(ordensProducao.deletedAt),
    // Cancelada fica fora do kanban. A FINALIZADA fica À VISTA POR 24 H,
    // contadas da conclusão (Q182): o gerente que chega de manhã vê na coluna
    // "Produção concluída" o que terminou de madrugada, com o resultado.
    // Passada a janela ela sai sozinha na próxima carga, sem timer — e
    // continua em Ordens, no filtro "Finalizadas". Filtrado AQUI, no SQL.
    ne(ordensProducao.status, 'cancelado'),
    or(
      ne(ordensProducao.status, 'enviado'),
      concluidaDesdeSql(inicioDaJanela(new Date())),
    )!,
  ]

  // SEM FILTRO POR CARGO, igual à lista de /ordens: o operador enxerga a
  // fábrica inteira, porque age em qualquer máquina (a estação é do tablet,
  // não dele — src/lib/db/acao-do-operador.ts).

  if (filtros.q && filtros.q.trim().length > 0) {
    const term = `%${filtros.q.trim()}%`
    conditions.push(
      or(
        ilike(ordensProducao.numero, term),
        ilike(produtos.nome, term),
        ilike(produtos.sku, term),
        ilike(produtos.codigo, term),
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

  // A cor do card é a da estação da MÁQUINA, e só dela. Havia um fallback
  // pela estação do RESPONSÁVEL (via `estacao_operadores`), que saiu quando o
  // operador deixou de pertencer a estação: a OP sem máquina não é de estação
  // nenhuma, e pintá-la com a cor de quem pegou diria o contrário.
  const estMaq = alias(estacoes, 'est_maq')

  const rows = await db
    .select({
      op: ordensProducao,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      produtoCodigo: produtos.codigo,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      responsavelNome: users.nome,
      maquinaCodigo: maquinas.codigo,
      maquinaNome: maquinas.nome,
      remessaCanal: remessasFull.canal,
      remessaContaNome: contasMarketplace.nome,
      remessaDataEnvio: remessasFull.dataEnvio,
      estacaoCorMaq: estMaq.cor,
      estacaoNomeMaq: estMaq.nome,
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
    // A conta da remessa, pro rótulo "Full Shopee · Conta 5 · 30/09". 1:1.
    .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
    .leftJoin(
      estMaq,
      and(eq(estMaq.id, maquinas.estacaoId), isNull(estMaq.deletedAt)),
    )
    .where(and(...conditions))
    .orderBy(
      // Enum ordem_prioridade é declarado ['baixa','normal','alta','urgente']
      // — Postgres ordena enum pela ordem de declaração, não alfabética.
      // DESC traz urgente/alta primeiro (mais importante no topo da coluna).
      desc(ordensProducao.prioridade),
      asc(ordensProducao.dataPrevistaFim),
      // DESEMPATE pelo número (único): as OPs de uma remessa têm o MESMO
      // prazo, e sem isto a ordem entre elas era a do disco, que pode mudar
      // depois de qualquer UPDATE. A mais antiga primeiro. O "Iniciar" e a
      // Fila desempatam igual.
      asc(ordensProducao.numero),
    )

  const now = Date.now()
  return rows.map(
    ({
      op,
      produtoNome,
      produtoSku,
      produtoCodigo,
      variacaoCor,
      variacaoModelo,
      variacaoTamanho,
      responsavelNome,
      maquinaCodigo,
      maquinaNome,
      remessaCanal,
      remessaDataEnvio,
      remessaContaNome,
      estacaoCorMaq,
      estacaoNomeMaq,
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
      produtoCodigo: produtoCodigo ?? null,
      variacaoCor: variacaoCor ?? null,
      variacaoModelo: variacaoModelo ?? null,
      variacaoTamanho: variacaoTamanho ?? null,
      quantidade: op.quantidade,
      maquinaId: op.maquinaId,
      maquinaCodigo: maquinaCodigo ?? null,
      maquinaNome: maquinaNome ?? null,
      remessaFullId: op.remessaFullId,
      // O rótulo da pasta sai da fonte única (`rotuloDaRemessa`), a mesma
      // que o destino do tablet usa — era uma cópia montada à mão aqui, e a
      // pasta do gerente e a linha do operador precisam dizer a mesma coisa.
      // Com a conta: "Full Shopee · Conta 5 · 30/09" — sem ela, dois Fulls
      // do mesmo canal e dia viravam duas pastas com o mesmo nome.
      remessaLabel:
        remessaCanal && remessaDataEnvio
          ? rotuloDaRemessa(remessaCanal, remessaDataEnvio, remessaContaNome)
          : null,
      responsavelId: op.responsavelId,
      responsavelNome: responsavelNome ?? null,
      estacaoCor: estacaoCorMaq ?? null,
      estacaoNome: estacaoNomeMaq ?? null,
      produzido: produzido ?? 0,
      refugo: refugo ?? 0,
      dataPrevistaFim: op.dataPrevistaFim,
      // Atrasada é a PRODUÇÃO não concluída, não a OP não finalizada — atraso-da-op.ts.
      atrasada: producaoAtrasada(op.status, op.dataPrevistaFim, now),
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
  /** O programa da máquina ("059") — o que o operador lê primeiro. */
  produtoCodigo: string | null
  /** O produto só tem um tamanho entre as variações vivas: a linha omite. */
  tamanhoUnico: boolean
  /** Pra onde vai: "Full ML · 24/09", "Pedido #142", "Estoque"… */
  destino: string
  /** O canal, pra borda com a cor do marketplace no cartão (`corDoCanal`). */
  canalDestino: string
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
  /**
   * A estação VIVA da máquina, ou null. Pro "Você está cobrindo?"
   * (src/lib/producao/cobertura.ts) e pras seções do tablet sem estação.
   */
  estacao: { id: string; nome: string } | null
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

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A tela veio do cliente (as actions são endpoints), então é conferida antes
 * de virar filtro. Não é permissão — é só não mandar lixo pro SQL.
 */
function telaValida(tela: TelaDoTablet): boolean {
  return tela.tipo !== 'estacao' || uuidRe.test(tela.id)
}

/**
 * O recorte de máquinas da tela, sobre o LEFT JOIN com a estação VIVA
 * (`estacoes` com `deleted_at IS NULL`). "Sem estação" é a estação viva ser
 * nula — pega também a máquina que ficou apontando pra uma estação apagada,
 * que é o mesmo que `maquinaNaTela` enxerga pela `estacao` devolvida.
 */
function filtroDaTela(tela: TelaDoTablet) {
  switch (tela.tipo) {
    case 'todas':
      return undefined
    case 'sem-estacao':
      return isNull(estacoes.id)
    case 'estacao':
      return eq(estacoes.id, tela.id)
  }
}

export type EstacoesDoTablet = {
  estacoes: { id: string; nome: string }[]
  /** Há máquina viva sem estação viva — a aba "Sem estação" existe. */
  haMaquinaSemEstacao: boolean
}

/** O que monta as abas do tablet (src/lib/producao/tela-do-tablet.ts). */
export async function listarEstacoesDoTablet(): Promise<EstacoesDoTablet> {
  await requireArea('kanban')
  const [vivas, [semEstacao]] = await Promise.all([
    db
      .select({ id: estacoes.id, nome: estacoes.nome })
      .from(estacoes)
      .where(isNull(estacoes.deletedAt)),
    db
      .select({ id: maquinas.id })
      .from(maquinas)
      .leftJoin(
        estacoes,
        and(eq(estacoes.id, maquinas.estacaoId), isNull(estacoes.deletedAt)),
      )
      .where(and(isNull(maquinas.deletedAt), isNull(estacoes.id)))
      .limit(1),
  ])
  return { estacoes: vivas, haMaquinaSemEstacao: semEstacao !== undefined }
}

/**
 * As máquinas da tela do tablet — a aba aberta, ou todas no tablet sem
 * estação (src/lib/producao/tela-do-tablet.ts).
 *
 * A tela vem da URL, e não do usuário: o operador não pertence a estação
 * nenhuma, e a estação do APARELHO só decide qual aba abre primeiro. Ver
 * outra estação não dá nada que ele já não tenha — ele age em qualquer
 * máquina (src/lib/db/acao-do-operador.ts).
 */
export async function listarMaquinasDaEstacao(
  tela: TelaDoTablet,
): Promise<MaquinaDaEstacao[]> {
  // `requireArea`, e não `requireAuth`: o arquivo é 'use server', então esta
  // função é um endpoint mesmo só sendo chamada pela página — e a página já
  // exige a área. Sem isto, quem tem 'kanban' em `nenhum` teria a tela
  // fechada e a leitura aberta, que é a porta dos fundos exata que
  // /permissoes promete não existir.
  await requireArea('kanban')
  if (!telaValida(tela)) return []

  const rows = await db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      estacaoId: estacoes.id,
      estacaoNome: estacoes.nome,
      status: maquinas.status,
      opId: ordensProducao.id,
      opNumero: ordensProducao.numero,
      opQuantidade: ordensProducao.quantidade,
      opObservacoes: ordensProducao.observacoes,
      opResponsavelId: ordensProducao.responsavelId,
      opCanal: ordensProducao.canalDestino,
      responsavelNome: users.nome,
      produtoNome: produtos.nome,
      produtoCodigo: produtos.codigo,
      tamanhoUnico: tamanhoUnicoSql,
      remessaCanal: remessasFull.canal,
      remessaContaNome: contasMarketplace.nome,
      remessaDataEnvio: remessasFull.dataEnvio,
      pedidoNumero: orcamentos.numero,
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
      estacoes,
      and(eq(estacoes.id, maquinas.estacaoId), isNull(estacoes.deletedAt)),
    )
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
    // O DESTINO: remessa e pedido são 1:1 com a OP (FK na OP), então não
    // duplicam a linha da máquina.
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    // A conta da remessa, pro rótulo "Full Shopee · Conta 5 · 30/09". 1:1.
    .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
    .leftJoin(orcamentos, eq(orcamentos.id, ordensProducao.orcamentoId))
    .leftJoin(
      maquinaParadas,
      and(
        eq(maquinaParadas.maquinaId, maquinas.id),
        isNull(maquinaParadas.encerradaEm),
      ),
    )
    .where(and(filtroDaTela(tela), isNull(maquinas.deletedAt)))
    // POSIÇÃO ESTÁVEL. O cartão da TC-01 é sempre o primeiro, ocupada ou
    // livre: quem trabalha aqui aprende a estação pela posição, e uma grade
    // que se reordena quando uma OP começa obriga a reler tudo toda vez.
    .orderBy(asc(maquinas.codigo))

  return rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nome: r.nome,
      estacao:
        r.estacaoId !== null && r.estacaoNome !== null
          ? { id: r.estacaoId, nome: r.estacaoNome }
          : null,
      status: r.status,
      op:
        r.opId === null
          ? null
          : {
              id: r.opId,
              numero: r.opNumero!,
              produtoNome: r.produtoNome ?? '—',
              produtoCodigo: r.produtoCodigo ?? null,
              tamanhoUnico: Boolean(r.tamanhoUnico),
              destino: destinoDe({
                canal: r.opCanal ?? '',
                remessaCanal: r.remessaCanal,
                remessaDataEnvio: r.remessaDataEnvio,
                remessaContaNome: r.remessaContaNome,
                pedidoNumero: r.pedidoNumero,
              }),
              canalDestino: r.opCanal ?? '',
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
    }))
}

// -----------------------------------------------------------------
// A FILA DE UMA MÁQUINA — o diálogo de "Iniciar produção"
// -----------------------------------------------------------------
//
// ⚠️ CARREGA A LISTA INTEIRA, E NÃO UMA PÁGINA — e foi escolha, não descuido.
// O diálogo agrupa por DESTINO (cada Full, cada pedido, o Estoque), com a
// contagem no cabeçalho e o bloco na posição da OP mais urgente que ele tem.
// Com página de 20, as duas coisas mentem: um Full com 12 OPs espalhadas por
// três páginas diria "3 OPs", e cairia na posição da OP que calhou de vir na
// primeira página. Uma contagem agregada à parte acertaria o número mas não a
// posição — e seriam duas consultas pra montar uma lista.
//
// Cabe: é pouco dado por OP (uns 20 campos curtos, sem subconsulta cara), e a
// estação tem na casa das dezenas de OPs iniciáveis. O TETO existe pro dia em
// que isso deixar de ser verdade: passou dele, a lista vem cortada nas mais
// urgentes e a tela AVISA ("mostrando 300 de 412") — em vez de travar o
// tablet, ou de esconder OP sem dizer.
//
// A MÁQUINA VEM POR PARÂMETRO, e pode ser de QUALQUER estação: o operador
// inicia em qualquer máquina (a estação é do tablet, não dele), e a fila é
// comum. Ela só é conferida como máquina viva.
//
// O filtro de status vem de `STATUS_QUE_INICIAM`, a MESMA lista que
// `pegarOrdemAction` aceita. Divergir aqui produz um de dois estragos: a
// tela oferece o que o servidor recusa (toque que só dá erro), ou o servidor
// aceita o que a tela nunca mostra.

const OPS_POR_PAGINA = 20

/** O teto de segurança da lista do "Iniciar" — ver o comentário acima. */
const TETO_DO_INICIAR = 300

export type OpParaIniciar = {
  id: string
  numero: string
  status: StatusDaOrdem
  prioridade: PrioridadeNivel
  produtoNome: string
  /** O programa da máquina ("059") — ver `OpNaMaquina`. */
  produtoCodigo: string | null
  tamanhoUnico: boolean
  /** Pra onde vai — "Full ML · 24/09", "Pedido #142", "Estoque"… */
  destino: string
  /**
   * O BLOCO do "Iniciar": a chave (`chaveDoDestino`, de remessa, pedido e
   * canal) e o cabeçalho ("Full ML · Conta 1 · envio 29/09"). O canal dá a
   * cor do marketplace (`corDoCanal`).
   */
  canalDestino: string
  remessaFullId: string | null
  orcamentoId: string | null
  destinoBloco: string
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

export type ListaDoIniciar = {
  ops: OpParaIniciar[]
  /** Quantas existem de verdade — maior que `ops.length` só se `cortada`. */
  total: number
  /** Passou do teto: a lista traz só as mais urgentes, e a tela avisa. */
  cortada: boolean
}

export async function listarOpsParaIniciar(
  maquinaId: string,
  filtros: { q?: string } = {},
): Promise<ListaDoIniciar> {
  await requireArea('kanban')
  if (!uuidRe.test(maquinaId)) return { ops: [], total: 0, cortada: false }

  const [maquina] = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.id, maquinaId), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!maquina) return { ops: [], total: 0, cortada: false }

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
        // O código do programa, que agora é o que ele LÊ na linha. Antes a
        // busca achava "059" só porque o SKU começava com ele — o operador
        // digitava uma coisa e lia outra.
        ilike(produtos.codigo, `%${termo}%`),
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
      canal: ordensProducao.canalDestino,
      remessaFullId: ordensProducao.remessaFullId,
      orcamentoId: ordensProducao.orcamentoId,
      produtoNome: produtos.nome,
      produtoCodigo: produtos.codigo,
      tamanhoUnico: tamanhoUnicoSql,
      remessaCanal: remessasFull.canal,
      remessaContaNome: contasMarketplace.nome,
      remessaDataEnvio: remessasFull.dataEnvio,
      pedidoNumero: orcamentos.numero,
      pedidoCliente: orcamentos.cliente,
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
    // O destino, 1:1 com a OP: não duplica linha nem mexe no COUNT acima.
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    // A conta da remessa, pro rótulo "Full Shopee · Conta 5 · 30/09". 1:1.
    .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
    .leftJoin(orcamentos, eq(orcamentos.id, ordensProducao.orcamentoId))
    .where(and(...conditions))
    // A MESMA ORDEM DO KANBAN, e de propósito: o enum `ordem_prioridade` é
    // declarado baixa < normal < alta < urgente, então DESC traz urgente
    // primeiro sem CASE nenhum. Prazo em ASC deixa NULL por último, que é o
    // que se quer — OP sem prazo não fura fila de OP com prazo. É ESTA ordem
    // que `agruparPorDestino` usa pra posicionar os blocos.
    //
    // ⚠️ O DESEMPATE PELO NÚMERO decide mais aqui do que no kanban. Dois
    // Fulls com o mesmo "produção até" empatam, e sem desempate QUAL BLOCO
    // VEM PRIMEIRO (e abre sozinho) era a ordem do disco, que muda a cada
    // UPDATE: fechar e abrir o diálogo podia trocar o bloco de cima.
    .orderBy(
      desc(ordensProducao.prioridade),
      asc(ordensProducao.dataPrevistaFim),
      asc(ordensProducao.numero),
    )
    .limit(TETO_DO_INICIAR)

  return {
    ops: rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      status: r.status,
      prioridade: r.prioridade,
      produtoNome: r.produtoNome,
      produtoCodigo: r.produtoCodigo ?? null,
      tamanhoUnico: Boolean(r.tamanhoUnico),
      destino: destinoDe(r),
      canalDestino: r.canal,
      remessaFullId: r.remessaFullId,
      orcamentoId: r.orcamentoId,
      destinoBloco: destinoBlocoDe(r),
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
    cortada: total > rows.length,
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
//   1. uma consulta MAGRA (seis colunas, zero join, zero subquery) que
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
  /** Só pro desempate de `ordenarComoOKanban`. */
  numero: string
}

// Status que só podem estar à vista pela CONCLUSÃO (ou que nunca estão): a
// consulta magra só os lê com conclusão dentro da janela. É um recorte GROSSO
// no SQL, pra não carregar a história inteira da estação; quem decide o
// destino continua sendo `destinoDaOrdem`.
const SO_PELA_CONCLUSAO = [
  'pronto_envio',
  'enviado',
  'acabamento',
  'embalagem',
  'cancelado',
] as const satisfies readonly StatusDaOrdem[]

/**
 * As OPs da tela do tablet, agrupadas pelo destino.
 *
 * A FILA É COMUM: toda OP esperando aparece em toda aba, porque qualquer
 * operador inicia em qualquer máquina. As TERMINADAS seguem a estação que
 * está na tela, pela máquina em que a OP foi feita (`terminadaNaTela`).
 */
async function opsPorDestino(
  tela: TelaDoTablet,
): Promise<Map<DestinoNaEstacao, OrdemMagra[]>> {
  // ⚠️ FILTRADO NO SQL. Antes esta consulta lia TODAS as OPs da estação,
  // desde sempre, e descartava finalizadas e canceladas em memória — em
  // poucos meses, milhares de linhas a cada recarga de tablet. Agora só vem o
  // que ainda está no chão (fila, máquina) e o que foi concluído dentro da
  // janela de 24 h.
  //
  // A máquina e a estação vêm VIVAS (LEFT JOIN com `deleted_at IS NULL`):
  // "está numa máquina?" e "de que estação?" sem adivinhação. Os dois joins
  // são por chave primária, então não duplicam a linha da OP.
  const agora = new Date()
  const rows = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      maquinaId: ordensProducao.maquinaId,
      prioridade: ordensProducao.prioridade,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      numero: ordensProducao.numero,
      concluidaEm: concluidaEmSql,
      maquinaViva: maquinas.id,
      estacaoDaMaquina: estacoes.id,
    })
    .from(ordensProducao)
    .leftJoin(
      maquinas,
      and(
        eq(maquinas.id, ordensProducao.maquinaId),
        isNull(maquinas.deletedAt),
      ),
    )
    .leftJoin(
      estacoes,
      and(eq(estacoes.id, maquinas.estacaoId), isNull(estacoes.deletedAt)),
    )
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        or(
          notInArray(ordensProducao.status, [...SO_PELA_CONCLUSAO]),
          concluidaDesdeSql(inicioDaJanela(agora)),
        ),
      ),
    )

  const porDestino = new Map<DestinoNaEstacao, OrdemMagra[]>()
  for (const { concluidaEm, maquinaViva, estacaoDaMaquina, ...r } of rows) {
    // Na máquina só está a OP EM PRODUÇÃO — o mesmo recorte do índice único
    // da migration 50 e do LEFT JOIN de `listarMaquinasDaEstacao`. Uma OP
    // `pronto_envio` que ainda carrega a máquina antiga não está mais lá.
    //
    // ⚠️ Em QUALQUER máquina viva, e não só nas da tela: a OP rodando na
    // Estação 3 está no cartão da aba dela, e não pode cair na Fila da
    // Estação 1 (ver `destinoDaOrdem`).
    const naMaquina = r.status === 'em_producao' && maquinaViva !== null
    const destino = destinoDaOrdem(
      r.status,
      naMaquina,
      concluidaNaJanela(concluidaEm ? new Date(concluidaEm) : null, agora),
    )
    if (
      destino === 'terminadas' &&
      !terminadaNaTela(
        maquinaViva !== null ? { estacaoId: estacaoDaMaquina } : null,
        tela,
      )
    ) {
      continue
    }
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
  if (prazoA !== prazoB) return prazoA - prazoB
  // O mesmo desempate do SQL: número, a mais antiga primeiro.
  return a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0
}

export type ContagensDaEstacao = {
  fila: number
  terminadas: number
  /**
   * Os ids que ENTRARAM na conta (fila + terminadas). Não é pra desenhar: é
   * pro tablet saber, quando chega um evento do Realtime, se a OP mexida
   * estava num dos dois números — o evento não diz de onde ela saiu. Ver
   * src/lib/producao/recarga-da-estacao.ts.
   */
  ids: string[]
}

export async function contarOpsDaEstacao(
  tela: TelaDoTablet,
): Promise<ContagensDaEstacao> {
  await requireArea('kanban')
  if (!telaValida(tela)) return { fila: 0, terminadas: 0, ids: [] }
  const porDestino = await opsPorDestino(tela)
  const fila = porDestino.get('fila') ?? []
  const terminadas = porDestino.get('terminadas') ?? []
  return {
    fila: fila.length,
    terminadas: terminadas.length,
    ids: [...fila, ...terminadas].map((o) => o.id),
  }
}

// A consulta de "Terminadas" É a lista de últimas conclusões — e não um
// terceiro botão no cabeçalho. Ela já responde "o que eu entreguei"; faltava
// dizer QUANDO, QUANTO e QUEM, que é a mesma informação que responde "será
// que salvou mesmo?" depois que o toast sumiu. Duas perguntas, uma lista.
export type OpDaConsulta = OpParaIniciar & {
  maquinaCodigo: string | null
  /**
   * A estação viva da máquina da OP, pro "Você está cobrindo?" do Desfazer
   * (src/lib/producao/cobertura.ts). Null quando a máquina está sem estação.
   */
  maquinaEstacao: { id: string; nome: string } | null
  /** Só preenchido em 'terminadas'. */
  concluidaEm: Date | null
  concluidaPor: string | null
  /** O texto que a conclusão gravou: total, diferença, refugo, quem iniciou. */
  resumo: string | null
  produzido: number
  refugo: number
  /**
   * O Desfazer ainda alcança a OP (`desfazerAlcanca`: pronta, ou finalizada
   * pela conclusão sem nada depois), a máquina dela está livre E quem
   * concluiu foi quem está logado? As três guardas de
   * `desfazerConclusaoAction`, calculadas aqui pra que o botão não apareça só
   * pra devolver erro. Quem recusa de verdade é a action.
   *
   * As conclusões dos colegas continuam na lista, com o nome — só sem botão.
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
  tela: TelaDoTablet,
  pagina = 1,
): Promise<PaginaDaConsulta> {
  const user = await requireArea('kanban')
  if (!telaValida(tela)) return { ops: [], total: 0, temMais: false }

  const todas = (await opsPorDestino(tela)).get(destino) ?? []

  // AS CONCLUSÕES VÊM DO HISTÓRICO, e ordenam a lista. "Terminadas" ordenada
  // por prioridade responderia "o que é mais urgente do que já saiu da
  // máquina", que não é pergunta de ninguém. Por hora de conclusão, a de
  // cima é a que ele acabou de fazer — que é o que ele foi conferir.
  const marcos =
    destino === 'terminadas'
      ? await marcosDasOps(todas.map((o) => o.id))
      : new Map<string, MarcosDaOp>()

  if (destino === 'terminadas') {
    todas.sort((a, b) => {
      const ta = marcos.get(a.id)?.conclusao?.em.getTime() ?? 0
      const tb = marcos.get(b.id)?.conclusao?.em.getTime() ?? 0
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
      canal: ordensProducao.canalDestino,
      remessaFullId: ordensProducao.remessaFullId,
      orcamentoId: ordensProducao.orcamentoId,
      produtoNome: produtos.nome,
      produtoCodigo: produtos.codigo,
      tamanhoUnico: tamanhoUnicoSql,
      remessaCanal: remessasFull.canal,
      remessaContaNome: contasMarketplace.nome,
      remessaDataEnvio: remessasFull.dataEnvio,
      pedidoNumero: orcamentos.numero,
      pedidoCliente: orcamentos.cliente,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      corHex: cores.codigoHex,
      corHex2: cores.codigoHex2,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      maquinaId: ordensProducao.maquinaId,
      maquinaCodigo: maquinas.codigo,
      maquinaEstacaoId: estacoes.id,
      maquinaEstacaoNome: estacoes.nome,
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
    .leftJoin(
      estacoes,
      and(eq(estacoes.id, maquinas.estacaoId), isNull(estacoes.deletedAt)),
    )
    .leftJoin(cores, eq(cores.nome, variacoesProduto.cor))
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    // A conta da remessa, pro rótulo "Full Shopee · Conta 5 · 30/09". 1:1.
    .leftJoin(contasMarketplace, eq(contasMarketplace.id, remessasFull.contaId))
    .leftJoin(orcamentos, eq(orcamentos.id, ordensProducao.orcamentoId))
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
        const m = marcos.get(r.id)
        const c = m?.conclusao ?? null
        return {
          id: r.id,
          numero: r.numero,
          status: r.status,
          prioridade: r.prioridade,
          produtoNome: r.produtoNome,
          produtoCodigo: r.produtoCodigo ?? null,
          tamanhoUnico: Boolean(r.tamanhoUnico),
          destino: destinoDe(r),
          canalDestino: r.canal,
          remessaFullId: r.remessaFullId,
          orcamentoId: r.orcamentoId,
          destinoBloco: destinoBlocoDe(r),
          variacaoCor: r.variacaoCor ?? null,
          variacaoModelo: r.variacaoModelo ?? null,
          variacaoTamanho: r.variacaoTamanho ?? null,
          quantidade: r.quantidade,
          observacoes: r.observacoes,
          corHex: r.corHex ?? null,
          corHex2: r.corHex2 ?? null,
          dataPrevistaFim: r.dataPrevistaFim,
          maquinaCodigo: r.maquinaCodigo ?? null,
          maquinaEstacao:
            r.maquinaEstacaoId !== null && r.maquinaEstacaoNome !== null
              ? { id: r.maquinaEstacaoId, nome: r.maquinaEstacaoNome }
              : null,
          concluidaEm: c?.em ?? null,
          concluidaPor: c?.porNome ?? null,
          resumo: c?.resumo ?? null,
          produzido: r.produzido ?? 0,
          refugo: r.refugo ?? 0,
          podeDesfazer:
            destino === 'terminadas' &&
            desfazerAlcanca({
              status: r.status,
              remessaFullId: r.remessaFullId,
              conclusaoEm: c?.em ?? null,
              ultimaTransicao: m?.ultimaTransicao ?? null,
            }) &&
            r.maquinaId !== null &&
            !maquinasOcupadas.has(r.maquinaId) &&
            (isManager(user.role) ||
              erroDoAutorDoDesfazer(
                c ? { id: c.porId, nome: c.porNome } : null,
                user.id,
              ) === null),
        }
      }),
    total: todas.length,
    temMais: inicio + daPagina.length < todas.length,
  }
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

  // No MESMO instante (conclusão e finalização nascem na mesma transação), a
  // finalização aparece antes — a lista é do mais novo pro mais velho.
  return rows
    .map(({ evento, usuarioNome }) => ({
      ...evento,
      usuarioNome: usuarioNome ?? null,
    }))
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        posicaoNoMesmoInstante({ tipo: 'status', ...b }) -
          posicaoNoMesmoInstante({ tipo: 'status', ...a }),
    )
}

// -----------------------------------------------------------------
// Opções dos filtros do kanban
// -----------------------------------------------------------------

/**
 * As máquinas e os responsáveis dos filtros do kanban, NUMA ida só. O
 * componente dos filtros busca uma vez ao montar: vindo da página, as duas
 * listas eram consultadas de novo a cada recarga do Realtime, e elas quase
 * nunca mudam.
 */
export async function opcoesDosFiltrosDoKanban() {
  await requireArea('kanban')
  const [maquinas, responsaveis] = await Promise.all([
    listarMaquinasParaOrdem(),
    listarResponsaveis(),
  ])
  return { maquinas, responsaveis }
}
