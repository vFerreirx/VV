'use server'

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { listarMaquinas } from '../maquinas/actions'
import { destinoInicial, nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { condicaoDeProducaoAtrasada } from '@/lib/db/atraso-da-op'
import {
  FUSO_BRASIL,
  hojeEmBrasilia,
  inicioDoDiaEmBrasilia,
  somarDias,
} from '@/lib/dia-brasil'
import {
  apontamentosProducao,
  maquinas,
  ordensProducao,
  produtos,
  users,
  variacoesProduto,
} from '@/lib/db/schema'
import { producaoAtrasada } from '@/lib/producao/atraso-da-op'
import {
  contarMaquinas,
  situacaoDaMaquina,
} from '@/lib/producao/estado-maquina'
import {
  VALORES_DE_MOTIVO,
  rotuloDoMotivo,
} from '@/lib/producao/parada-de-maquina'
import { ANTES_DA_CONCLUSAO } from '@/lib/producao/transicoes-da-op'
import { type statusValues } from '@/lib/validators/ordens'

// ⚠️ O DASHBOARD É DA GESTÃO, e cada leitura daqui confere isso. O arquivo é
// 'use server': toda função exportada é um endpoint público, alcançável sem
// passar pela página. A guarda é a mesma da página — a área `dashboard`,
// travada em admin e gerente — e quem não é da gestão vai pra casa dele.
async function exigirDashboard() {
  const user = await requireAuth()
  if ((await nivelDaAreaPara(user.role, 'dashboard')) === 'nenhum') {
    redirect(await destinoInicial(user.role))
  }
  return user
}

// O instante em que o mês corrente COMEÇOU em Brasília.
//
// Antes era `new Date()` + `setDate(1)` + `setHours(0,0,0,0)`, que usa o fuso
// do processo. Em UTC isso dá meia-noite UTC do dia 1, que é 21h do último dia
// do mês ANTERIOR em Brasília — a janela pegava três horas do mês passado, e o
// "mês corrente" virava às 21h do dia 31.
function inicioDoMes(): Date {
  return inicioDoDiaEmBrasilia(`${hojeEmBrasilia().slice(0, 7)}-01`)
}

// -----------------------------------------------------------------
// Os quatro números do topo
// -----------------------------------------------------------------
//
// CADA UM É UMA PERGUNTA COM TELA PRA RESOLVER. Os de antes ("OPs ativas",
// "Em produção") eram contagens sem ação, e o "Máquinas operando" lia o
// CADASTRO (`maquinas.status = 'operando'`) — com a fábrica parada, dizia
// 100% em uso. O mesmo erro que src/lib/producao/estado-maquina.ts descreve e
// que as outras telas já tinham corrigido.

export type DashboardKPIs = {
  /** Aptas com OP — a MESMA conta da /fabrica e do kanban. */
  maquinasProduzindo: number
  /** Produzindo + livres: as que podem produzir. */
  maquinasAptas: number
  /** Em manutenção ou setup, com parada aberta. Desativada não conta. */
  paradasAgora: number
  /** O motivo mais comum entre as paradas agora, ou null se nenhuma tem. */
  motivoMaisComum: string | null
  /** Prazo vencido e produção não concluída — atraso-da-op.ts. */
  producaoAtrasada: number
  // O quarto número, "Falta despachar", sai das REMESSAS abertas que a
  // página já carrega (`riscoDaRemessa`) — ver dashboard/page.tsx.
}

export async function obterKPIs(): Promise<DashboardKPIs> {
  await exigirDashboard()

  const [lista, [atrasadas]] = await Promise.all([
    // ⚠️ A MESMA CONSULTA E A MESMA REGRA DA /fabrica (`listarMaquinas` +
    // `situacaoDaMaquina` + `contarMaquinas`). Uma conta escrita à mão aqui
    // divergiria da tela para onde o card leva.
    listarMaquinas(),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(ordensProducao)
      .where(
        and(isNull(ordensProducao.deletedAt), condicaoDeProducaoAtrasada()),
      ),
  ])

  const situacoes = lista.map((m) => ({
    maquina: m,
    s: situacaoDaMaquina(m.status, m.op !== null),
  }))
  const contagem = contarMaquinas(situacoes.map((x) => x.s))

  // PARADA AGORA = manutenção ou setup com parada aberta. A DESATIVADA FICA
  // DE FORA: desativar também abre parada, e uma máquina desativada há meses
  // ficaria pra sempre neste número, escondendo a que parou hoje.
  const paradas = situacoes.filter(
    (x) =>
      (x.s.disponibilidade === 'manutencao' ||
        x.s.disponibilidade === 'em_setup') &&
      x.maquina.paradaAberta !== null,
  )

  // O motivo mais comum. Empate desempata pela ordem da tupla — estável, sem
  // depender da ordem em que as máquinas vieram.
  const porMotivo = new Map<string, number>()
  for (const p of paradas) {
    const motivo = p.maquina.paradaAberta?.motivo
    if (motivo) porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1)
  }
  let motivoMaisComum: string | null = null
  let maior = 0
  for (const valor of VALORES_DE_MOTIVO) {
    const n = porMotivo.get(valor) ?? 0
    if (n > maior) {
      maior = n
      motivoMaisComum = rotuloDoMotivo(valor)
    }
  }

  return {
    maquinasProduzindo: contagem.emProducao,
    maquinasAptas: contagem.emProducao + contagem.livres,
    paradasAgora: paradas.length,
    motivoMaisComum,
    producaoAtrasada: atrasadas?.total ?? 0,
  }
}

// -----------------------------------------------------------------
// OPs urgentes / atrasadas
// -----------------------------------------------------------------

export type OpUrgenteItem = {
  id: string
  numero: string
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoTamanho: string | null
  status: (typeof statusValues)[number]
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  dataPrevistaFim: Date | null
  maquinaNome: string | null
  responsavelNome: string | null
  atrasada: boolean
}

export async function listarOpsUrgentes(
  limit = 5,
): Promise<OpUrgenteItem[]> {
  await exigirDashboard()

  // ⚠️ SEM FILTRO DE VISIBILIDADE DO OPERADOR. Existia um "OP pega fica
  // privada entre operadores" aqui, mas o dashboard passou a ser só da
  // gestão (`exigirDashboard`) — o operador nunca chega nesta consulta.

  const rows = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoTamanho: variacoesProduto.tamanho,
      status: ordensProducao.status,
      prioridade: ordensProducao.prioridade,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      maquinaNome: maquinas.nome,
      responsavelNome: users.nome,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        // SÓ O QUE PEDE AÇÃO NA PRODUÇÃO: atrasada, ou urgente/alta que
        // ainda não foi concluída. A urgente já concluída espera só o
        // despacho, e essa tem o card âmbar "Falta despachar".
        or(
          condicaoDeProducaoAtrasada(),
          and(
            inArray(ordensProducao.status, [...ANTES_DA_CONCLUSAO]),
            inArray(ordensProducao.prioridade, ['urgente', 'alta']),
          ),
        ),
      ),
    )
    // Urgentes/altas primeiro, depois prazos mais próximos.
    .orderBy(
      sql`CASE ${ordensProducao.prioridade}
        WHEN 'urgente' THEN 0
        WHEN 'alta' THEN 1
        WHEN 'normal' THEN 2
        WHEN 'baixa' THEN 3
      END`,
      asc(ordensProducao.dataPrevistaFim),
    )
    .limit(limit)

  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    produtoNome: r.produtoNome,
    produtoSku: r.produtoSku,
    variacaoCor: r.variacaoCor ?? null,
    variacaoTamanho: r.variacaoTamanho ?? null,
    status: r.status,
    prioridade: r.prioridade,
    dataPrevistaFim: r.dataPrevistaFim,
    maquinaNome: r.maquinaNome ?? null,
    responsavelNome: r.responsavelNome ?? null,
    atrasada: producaoAtrasada(r.status, r.dataPrevistaFim, now),
  }))
}

// -----------------------------------------------------------------
// Peças concluídas por dia (apontamentos por dia)
// -----------------------------------------------------------------

export type ProducaoDia = {
  dia: string // YYYY-MM-DD
  produzido: number
  refugo: number
}

export async function listarProducaoUltimosDias(
  dias = 14,
): Promise<ProducaoDia[]> {
  await exigirDashboard()

  // A série termina HOJE em Brasília e anda pra trás em dias de calendário.
  const ultimoDia = hojeEmBrasilia()
  const primeiroDia = somarDias(ultimoDia, -(dias - 1))
  const inicio = inicioDoDiaEmBrasilia(primeiroDia)

  // ⚠️ ÚNICO `AT TIME ZONE` do código, e src/lib/dia-brasil.ts registra a
  // exceção. `apontamentos_producao.inicio` é timestamptz e o TimeZone da
  // SESSÃO do Postgres é UTC, então `to_char` cru rendia o dia em UTC: todo
  // apontamento feito das 21h à meia-noite caía no dia SEGUINTE. Com turno da
  // noite isso não é bug noturno, é produção atribuída ao dia errado todo dia.
  //
  // O fuso vem IMPORTADO de dia-brasil (`FUSO_BRASIL`), nunca redigitado aqui:
  // o nome existe uma vez só no repositório, então não há duas cópias da regra
  // pra divergirem — Postgres e ICU leem a mesma tzdata.
  //
  // Agrupar no banco (e não trazer as linhas cruas pra somar em TS) mantém a
  // resposta em `dias` linhas por mais que a fábrica cresça.
  //
  // `sql.raw` não é descuido: o fuso PRECISA virar texto literal na query. Como
  // parâmetro ligado, as duas ocorrências viram placeholders DIFERENTES ($1 no
  // select, $2 no group by), o Postgres não reconhece as duas expressões como a
  // mesma e a query morre com 42803 ("must appear in the GROUP BY clause").
  // Interpolar é seguro aqui porque `FUSO_BRASIL` é constante do código, nunca
  // entrada de usuário.
  const diaEmBrasiliaSQL = sql<string>`to_char(${apontamentosProducao.inicio} AT TIME ZONE ${sql.raw(`'${FUSO_BRASIL}'`)}, 'YYYY-MM-DD')`

  const rows = await db
    .select({
      // MESMO fragmento no select e no group by, de propósito: eram duas
      // strings iguais copiadas, e duas cópias divergem quando alguém mexe
      // numa só.
      dia: diaEmBrasiliaSQL,
      produzido: sql<number>`coalesce(sum(${apontamentosProducao.quantidadeProduzida}), 0)::int`,
      refugo: sql<number>`coalesce(sum(${apontamentosProducao.quantidadeRefugo}), 0)::int`,
    })
    .from(apontamentosProducao)
    // ⚠️ JOIN COM A OP SÓ PRA PODER FILTRAR OP APAGADA. Sem ele, este
    // gráfico somava apontamento de OP que já foi pra lixeira — e apagar uma
    // OP não tirava do número o que ela tinha registrado.
    //
    // Apareceu com uma OP de teste que tinha 5000 peças apontadas: apagada
    // havia dias, e as 5000 seguiam plantadas no dia 09/09 do gráfico, sem
    // nenhuma OP viva que explicasse de onde vinham.
    //
    // `innerJoin` e não `leftJoin`: a FK de `ordem_id` é NOT NULL, então
    // apontamento sem OP não existe. Se um dia existir, ficar de fora é o
    // comportamento certo — número sem origem não é produção.
    .innerJoin(
      ordensProducao,
      eq(ordensProducao.id, apontamentosProducao.ordemId),
    )
    .where(
      and(
        gte(apontamentosProducao.inicio, inicio),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .groupBy(diaEmBrasiliaSQL)

  // Preenche dias sem apontamento com zero pra linha não ficar com gaps.
  // `somarDias` é aritmética de calendário pura: as chaves saem iguais às que
  // o `to_char` acima produz, sem passar por fuso de novo.
  const map = new Map(rows.map((r) => [r.dia, r]))
  const serie: ProducaoDia[] = []
  for (let i = 0; i < dias; i++) {
    const key = somarDias(primeiroDia, i)
    const r = map.get(key)
    serie.push({
      dia: key,
      produzido: r?.produzido ?? 0,
      refugo: r?.refugo ?? 0,
    })
  }
  return serie
}

// -----------------------------------------------------------------
// Top produtos do mês (peças boas CONCLUÍDAS no mês corrente)
// -----------------------------------------------------------------

export type TopProdutoItem = {
  produtoId: string
  produtoNome: string
  produtoSku: string
  /** Peças boas registradas no mês. */
  unidades: number
  /** Quantas OPs diferentes somaram essas peças. */
  ops: number
}

export async function listarTopProdutosMes(
  limit = 5,
): Promise<TopProdutoItem[]> {
  await exigirDashboard()

  const inicioMes = inicioDoMes()

  // ⚠️ O QUE SAIU DA MÁQUINA NO MÊS, e não o que foi PEDIDO no mês. Antes
  // somava `ordens_producao.quantidade` das OPs criadas no mês: a meta, não a
  // produção — uma OP de 500 criada ontem e nunca iniciada liderava o ranking.
  //
  // Conta pelo `inicio` do apontamento, que no fluxo novo é o momento da
  // conclusão (o registro é feito só no fim). O mês começa em Brasília
  // (`inicioDoMes`), o mesmo cuidado de fuso de `listarProducaoUltimosDias`.
  const soma = sql<number>`coalesce(sum(${apontamentosProducao.quantidadeProduzida}), 0)::int`
  const rows = await db
    .select({
      produtoId: produtos.id,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      unidades: soma,
      ops: sql<number>`count(distinct ${ordensProducao.id})::int`,
    })
    .from(apontamentosProducao)
    // Mesmo motivo do gráfico por dia: OP apagada não soma.
    .innerJoin(
      ordensProducao,
      eq(ordensProducao.id, apontamentosProducao.ordemId),
    )
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(
      and(
        gte(apontamentosProducao.inicio, inicioMes),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .groupBy(produtos.id, produtos.nome, produtos.sku)
    .having(sql`sum(${apontamentosProducao.quantidadeProduzida}) > 0`)
    .orderBy(desc(sql`sum(${apontamentosProducao.quantidadeProduzida})`))
    .limit(limit)

  return rows
}
