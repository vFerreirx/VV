'use server'

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'

import {
  isManager as isManagerRole,
  requireArea,
  requireAuth,
  requireAreaEscrita,
} from '@/lib/auth/require-auth'
import { podeEscrever } from '@/lib/auth/permissoes'
import { recusaSeTabletTravado } from '@/lib/auth/tablet-travado'
import { gravarBaixa } from '@/lib/db/baixa-da-op'
import { hojeEmBrasilia } from '@/lib/dia-brasil'
import {
  prazoDaOp,
  producaoAteEfetivo,
  rotuloDaRemessa,
} from '@/lib/producao/prazo-da-remessa'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { db } from '@/lib/db'
import {
  condicaoDeVisaoDoOperador,
  estacaoDoOperador,
  operadorPodeAgirNaOrdem,
} from '@/lib/db/estacao-operadores'
import {
  apontamentosProducao,
  cores,
  estacoes,
  eventosKanban,
  maquinas,
  ordensProducao,
  produtos,
  remessasFull,
  users,
  variacoesProduto,
  type Maquina,
  type OrdemProducao,
  type Produto,
  type User,
  type VariacaoProduto,
} from '@/lib/db/schema'
import { erroDaVariacao } from '@/lib/producao/catalogo-op'
import { motivoDeImpedimento } from '@/lib/producao/estado-maquina'
import {
  calcularConclusao,
  erroDeQuantidade,
  resumoDaConclusao,
} from '@/lib/producao/conclusao'
import {
  confirmacaoAntesDeIniciar,
  OBSERVACAO_DE_MATERIA_PRIMA,
  observacaoDeMaquinaAtribuida,
  podeIniciar,
} from '@/lib/producao/inicio-da-op'
import {
  erroDaExclusao,
  erroDaTransicaoGenerica,
  erroDaTransicaoPeloFormulario,
  erroDoCancelamento,
  podeConcluirProducao,
} from '@/lib/producao/transicoes-da-op'
import {
  apontamentoSchema,
  criarOrdemSchema,
  mudarStatusOrdemSchema,
  ordemSchema,
  ordensFiltrosSchema,
  STATUS_LABEL_CURTO,
  type ApontamentoInput,
  type MudarStatusOrdemInput,
  type OrdemInput,
  type OrdensFiltros,
  type statusValues,
} from '@/lib/validators/ordens'

// `assumiu` = a OP mudou de dono nesta ação. A tela usa isso pra avisar o
// operador que a OP agora é dele — troca silenciosa de dono é como o colega
// descobre do pior jeito que a OP não é mais dele.
export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string; assumiu?: boolean }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export type OrdemListItem = OrdemProducao & {
  produtoNome: string
  produtoSku: string
  variacaoCor: string | null
  variacaoTamanho: string | null
  maquinaNome: string | null
  responsavelNome: string | null
  // "15/07" quando a OP pertence a uma remessa Full.
  remessaData: string | null
  atrasada: boolean
  /** Soma dos apontamentos — a coluna "Resultado". Zero e zero = sem registro. */
  produzido: number
  refugo: number
}

// Tamanho da página da listagem de ordens.
const ORDENS_POR_PAGINA = 50

export type OrdensPagina = {
  ordens: OrdemListItem[]
  total: number
  pagina: number
  totalPaginas: number
}

export async function listarOrdens(
  filtros: OrdensFiltros = {},
): Promise<OrdensPagina> {
  const user = await requireAuth()
  const parsed = ordensFiltrosSchema.safeParse(filtros)
  const f = parsed.success ? parsed.data : {}

  const conditions = [isNull(ordensProducao.deletedAt)]

  // O operador enxerga a fila comum + a estação dele. A regra mora em
  // src/lib/db/estacao-operadores.ts porque ela vale IGUAL aqui e na lista
  // de /ordens — eram duas cópias da versão antiga, e divergir faria a OP
  // aparecer no board e sumir da lista. Os demais cargos veem tudo.
  if (user.role === 'operador') {
    conditions.push(await condicaoDeVisaoDoOperador(user.id))
  }
  if (f.q && f.q.length > 0) {
    conditions.push(
      or(
        ilike(ordensProducao.numero, `%${f.q}%`),
        ilike(produtos.nome, `%${f.q}%`),
        ilike(produtos.sku, `%${f.q}%`),
      )!,
    )
  }
  // ⚠️ SEM STATUS NA URL É "ABERTAS", e não "todas". A lista abre no que
  // está em andamento — tudo que não teve baixa nem foi cancelado —, porque é
  // isso que se procura aqui no dia a dia. "Todas" é um valor EXPLÍCITO
  // (`status=todos`), e quem linka pra uma OP específica que pode estar com
  // baixa (a busca global, o calendário do Full) manda ele junto.
  const status = f.status ?? 'abertas'
  if (status === 'abertas') {
    conditions.push(notInArray(ordensProducao.status, ['enviado', 'cancelado']))
  } else if (status !== 'todos') {
    conditions.push(eq(ordensProducao.status, status))
  }
  if (f.canal && f.canal !== 'todos') {
    conditions.push(eq(ordensProducao.canalDestino, f.canal))
  }
  if (f.prioridade && f.prioridade !== 'todas') {
    conditions.push(eq(ordensProducao.prioridade, f.prioridade))
  }
  if (f.maquinaId && f.maquinaId.length > 0) {
    conditions.push(eq(ordensProducao.maquinaId, f.maquinaId))
  }
  if (f.remessaId && f.remessaId.length > 0) {
    conditions.push(eq(ordensProducao.remessaFullId, f.remessaId))
  }

  // Total (com os mesmos filtros/joins) pra paginação.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(and(...conditions))

  const totalPaginas = Math.max(1, Math.ceil(total / ORDENS_POR_PAGINA))
  const pagina = Math.min(f.pagina ?? 1, totalPaginas)

  const rows = await db
    .select({
      op: ordensProducao,
      produtoNome: produtos.nome,
      produtoSku: produtos.sku,
      variacaoCor: variacoesProduto.cor,
      variacaoTamanho: variacoesProduto.tamanho,
      maquinaNome: maquinas.nome,
      responsavelNome: users.nome,
      remessaDataEnvio: remessasFull.dataEnvio,
      // ⚠️ `"ordens_producao"."id"` QUALIFICADO À MÃO, como em
      // producao/actions.ts: sem isso o Postgres correlaciona com o `id` da
      // própria subquery e o resultado sai sempre zero.
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
    .leftJoin(users, eq(users.id, ordensProducao.responsavelId))
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    .where(and(...conditions))
    .orderBy(desc(ordensProducao.createdAt))
    .limit(ORDENS_POR_PAGINA)
    .offset((pagina - 1) * ORDENS_POR_PAGINA)

  const now = Date.now()
  const ordens = rows.map(
    ({
      op,
      produtoNome,
      produtoSku,
      variacaoCor,
      variacaoTamanho,
      maquinaNome,
      responsavelNome,
      remessaDataEnvio,
      produzido,
      refugo,
    }) => ({
      ...op,
      produtoNome,
      produtoSku,
      variacaoCor: variacaoCor ?? null,
      variacaoTamanho: variacaoTamanho ?? null,
      maquinaNome: maquinaNome ?? null,
      responsavelNome: responsavelNome ?? null,
      remessaData: remessaDataEnvio
        ? `${remessaDataEnvio.slice(8, 10)}/${remessaDataEnvio.slice(5, 7)}`
        : null,
      atrasada:
        op.dataPrevistaFim !== null &&
        op.status !== 'enviado' &&
        op.status !== 'cancelado' &&
        new Date(op.dataPrevistaFim).getTime() < now,
      produzido: produzido ?? 0,
      refugo: refugo ?? 0,
    }),
  )

  return { ordens, total, pagina, totalPaginas }
}

export type OrdemDetalhe = OrdemProducao & {
  produto: Produto
  variacao: VariacaoProduto | null
  maquina: Maquina | null
  /**
   * A remessa Full da OP, com o prazo da produção JÁ efetivo (o escolhido ou
   * o padrão). É o que o painel mostra e o que o "Mudar destino" precisa pra
   * dizer de onde a OP sai.
   */
  remessa: {
    id: string
    rotulo: string
    dataEnvio: string
    producaoAte: string
  } | null
  criador: Pick<User, 'id' | 'nome' | 'email'> | null
  responsavel: Pick<User, 'id' | 'nome' | 'email'> | null
}

export async function obterOrdem(id: string): Promise<OrdemDetalhe | null> {
  await requireAuth()
  const [row] = await db
    .select({
      op: ordensProducao,
      produto: produtos,
      variacao: variacoesProduto,
      maquina: maquinas,
      remessaCanal: remessasFull.canal,
      remessaDataEnvio: remessasFull.dataEnvio,
      remessaProducaoAte: remessasFull.producaoAte,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)

  if (!row) return null

  // Busca criador e responsável separados (evita JOINs múltiplos no users).
  const [criador, responsavel] = await Promise.all([
    row.op.criadoPor
      ? db
          .select({ id: users.id, nome: users.nome, email: users.email })
          .from(users)
          .where(eq(users.id, row.op.criadoPor))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    row.op.responsavelId
      ? db
          .select({ id: users.id, nome: users.nome, email: users.email })
          .from(users)
          .where(eq(users.id, row.op.responsavelId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ])

  return {
    ...row.op,
    produto: row.produto,
    variacao: row.variacao ?? null,
    maquina: row.maquina ?? null,
    remessa:
      row.op.remessaFullId && row.remessaCanal && row.remessaDataEnvio
        ? {
            id: row.op.remessaFullId,
            rotulo: rotuloDaRemessa(row.remessaCanal, row.remessaDataEnvio),
            dataEnvio: row.remessaDataEnvio,
            producaoAte: producaoAteEfetivo({
              dataEnvio: row.remessaDataEnvio,
              producaoAte: row.remessaProducaoAte,
            }),
          }
        : null,
    criador,
    responsavel,
  }
}

// -----------------------------------------------------------------
// Listas pra preencher selects do form
// -----------------------------------------------------------------

export type ProdutoComVariacoesParaForm = Pick<
  Produto,
  'id' | 'sku' | 'nome'
> & {
  variacoes: Array<
    Pick<VariacaoProduto, 'id' | 'skuVariacao' | 'cor' | 'modelo' | 'tamanho'> & {
      /**
       * O hex da cor, pro swatch da busca do "Nova OP". Mesmo LEFT JOIN por
       * nome (`cores.nome` = `variacoes_produto.cor`) do cartão e do tablet:
       * a amostra que o gerente escolhe tem que ser a que o operador confere
       * contra o fio. Sem cor casada, null — e o swatch vira o quadrado de
       * "sem cor definida".
       */
      corHex: string | null
      corHex2: string | null
    }
  >
}

export async function listarProdutosParaOrdem(
  { somenteAtivas = false }: { somenteAtivas?: boolean } = {},
): Promise<
  ProdutoComVariacoesParaForm[]
> {
  await requireAuth()

  const prods = await db
    .select({
      id: produtos.id,
      sku: produtos.sku,
      nome: produtos.nome,
    })
    .from(produtos)
    .where(and(isNull(produtos.deletedAt), eq(produtos.ativo, true)))
    .orderBy(asc(produtos.sku))

  if (prods.length === 0) return []

  const vars = await db
    .select({
      id: variacoesProduto.id,
      produtoId: variacoesProduto.produtoId,
      skuVariacao: variacoesProduto.skuVariacao,
      cor: variacoesProduto.cor,
      modelo: variacoesProduto.modelo,
      tamanho: variacoesProduto.tamanho,
      corHex: cores.codigoHex,
      corHex2: cores.codigoHex2,
    })
    .from(variacoesProduto)
    .leftJoin(cores, eq(cores.nome, variacoesProduto.cor))
    // A criação oferece só variações disponíveis. A edição mantém as antigas
    // para que uma OP histórica não perca a identificação ao abrir o formulário.
    .where(somenteAtivas ? isNull(variacoesProduto.deletedAt) : undefined)
    .orderBy(asc(variacoesProduto.skuVariacao))

  const byProduto = new Map<string, typeof vars>()
  for (const v of vars) {
    const arr = byProduto.get(v.produtoId)
    if (arr) arr.push(v)
    else byProduto.set(v.produtoId, [v])
  }

  return prods.map((p) => ({
    ...p,
    variacoes: (byProduto.get(p.id) ?? []).map((v) => ({
      id: v.id,
      skuVariacao: v.skuVariacao,
      cor: v.cor,
      modelo: v.modelo,
      tamanho: v.tamanho,
      corHex: v.corHex ?? null,
      corHex2: v.corHex2 ?? null,
    })),
  }))
}

export async function listarMaquinasParaOrdem(): Promise<
  Array<Pick<Maquina, 'id' | 'codigo' | 'nome' | 'status'>>
> {
  await requireAuth()
  return db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      status: maquinas.status,
    })
    .from(maquinas)
    .where(and(isNull(maquinas.deletedAt), sql`${maquinas.status} <> 'desativada'`))
    .orderBy(asc(maquinas.codigo))
}

export async function listarResponsaveis(): Promise<
  Array<Pick<User, 'id' | 'nome' | 'email' | 'role'>>
> {
  await requireAuth()
  return db
    .select({
      id: users.id,
      nome: users.nome,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.ativo, true),
        isNull(users.deletedAt),
        // Apenas roles que fazem sentido como responsável da OP.
        sql`${users.role} IN ('admin', 'gerente_producao', 'operador')`,
      ),
    )
    .orderBy(asc(users.nome))
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarOrdemAction(
  input: OrdemInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAreaEscrita('ordens')

  const parsed = criarOrdemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // O catálogo pode mudar entre abrir a tela e salvar. Valida novamente o
  // produto e a variação no servidor; a FK sozinha aceita variação de outro produto.
  const catalogo = await db.select({ produtoId: produtos.id, variacaoId: variacoesProduto.id })
    .from(produtos)
    .leftJoin(variacoesProduto, and(eq(variacoesProduto.produtoId, produtos.id), isNull(variacoesProduto.deletedAt)))
    .where(and(eq(produtos.id, data.produtoId), eq(produtos.ativo, true), isNull(produtos.deletedAt)))
  if (!catalogo.length) return { success: false, error: 'Produto indisponível. Selecione novamente no catálogo.' }
  // Variação SEMPRE obrigatória — ver `erroDaVariacao` (catalogo-op.ts).
  const erroVariacao = erroDaVariacao(data.variacaoId, catalogo.flatMap((v) => v.variacaoId ? [{ id: v.variacaoId }] : []))
  if (erroVariacao) return { success: false, error: erroVariacao }

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(ordensProducao)
      .values({
        // Trigger BEFORE INSERT sobrescreve com 'OP-AAAA-NNNN'.
        numero: '',
        produtoId: data.produtoId,
        variacaoId: data.variacaoId,
        quantidade: data.quantidade,
        maquinaId: data.maquinaId,
        canalDestino: data.canalDestino,
        prioridade: data.prioridade,
        status: data.status,
        dataPrevistaInicio: data.dataPrevistaInicio,
        dataPrevistaFim: data.dataPrevistaFim,
        criadoPor: user.id,
        responsavelId: data.responsavelId,
        observacoes: data.observacoes ?? null,
      })
      .returning({ id: ordensProducao.id, numero: ordensProducao.numero })

    // Evento inicial no kanban (statusAnterior = null).
    await tx.insert(eventosKanban).values({
      ordemId: inserted!.id,
      statusAnterior: null,
      statusNovo: data.status,
      usuarioId: user.id,
      observacao: 'OP criada',
    })

    return inserted!.id
  })

  revalidatePath('/ordens')
  revalidatePath('/producao')
  return { success: true, data: { id: novoId }, message: 'OP criada' }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarOrdemAction(
  id: string,
  input: OrdemInput,
): Promise<ActionResult> {
  const user = await requireAreaEscrita('ordens')

  const parsed = ordemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select()
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'OP não encontrada' }
  }

  // Preserva o estado de registros antigos, mas não permite escolher novamente
  // etapas retiradas do fluxo ao editar outra OP.
  if (atual.status !== data.status && (data.status === 'acabamento' || data.status === 'embalagem')) {
    return { success: false, error: 'Essa etapa não faz mais parte do fluxo de produção' }
  }

  // ⚠️ ENTRAR EM PRODUÇÃO, CONCLUIR E DAR BAIXA NÃO PASSAM POR AQUI. O
  // formulário não tem como pedir máquina nem quantidade, e cada uma dessas
  // transições tem action própria que registra o que falta. A regra mora em
  // src/lib/producao/transicoes-da-op.ts, e o select do formulário usa a
  // mesma função pra não oferecer o que esta linha recusa.
  const erroDaPorta = erroDaTransicaoPeloFormulario(atual.status, data.status)
  if (erroDaPorta) return { success: false, error: erroDaPorta }

  // ⚠️ E A MÁQUINA DE UMA OP EM PRODUÇÃO NÃO TROCA POR AQUI. Isto trocava sem
  // validar nada: máquina em manutenção entrava, e máquina ocupada estourava o
  // índice único `ordens_producao_maquina_em_producao_uidx` como erro 500.
  //
  // `undefined` é "não mexeu", e não "tirou a máquina": o formulário devolve
  // o valor que recebeu, campo vazio vira `undefined` no schema, e o Drizzle
  // não grava chave `undefined` no `.set()`.
  if (
    atual.status === 'em_producao' &&
    data.maquinaId !== undefined &&
    data.maquinaId !== atual.maquinaId
  ) {
    return {
      success: false,
      error: 'A máquina de uma OP em produção não é trocada pelo formulário',
    }
  }

  const statusMudou = atual.status !== data.status

  await db.transaction(async (tx) => {
    await tx
      .update(ordensProducao)
      .set({
        produtoId: data.produtoId,
        variacaoId: data.variacaoId,
        quantidade: data.quantidade,
        maquinaId: data.maquinaId,
        canalDestino: data.canalDestino,
        prioridade: data.prioridade,
        status: data.status,
        dataPrevistaInicio: data.dataPrevistaInicio,
        dataPrevistaFim: data.dataPrevistaFim,
        responsavelId: data.responsavelId,
        observacoes: data.observacoes ?? null,
        // Marca dataRealInicio quando entra em produção pela primeira vez.
        dataRealInicio:
          atual.dataRealInicio === null && data.status === 'em_producao'
            ? new Date()
            : atual.dataRealInicio,
        // Marca dataRealFim quando vira enviado.
        dataRealFim:
          data.status === 'enviado' ? atual.dataRealFim ?? new Date() : atual.dataRealFim,
      })
      .where(eq(ordensProducao.id, id))

    if (statusMudou) {
      await tx.insert(eventosKanban).values({
        ordemId: id,
        statusAnterior: atual.status,
        statusNovo: data.status,
        usuarioId: user.id,
      })
    }
  })

  revalidatePath('/ordens')
  revalidatePath(`/ordens/${id}`)
  revalidatePath('/producao')
  return { success: true, message: 'OP atualizada' }
}

// -----------------------------------------------------------------
// Mudar status (kanban / quick action)
// -----------------------------------------------------------------

export async function mudarStatusOrdemAction(
  id: string,
  input: MudarStatusOrdemInput,
): Promise<ActionResult> {
  const user = await requireAuth()
  // Tablet travado não grava — ver src/lib/auth/inatividade.ts.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado

  const parsed = mudarStatusOrdemSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select()
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'OP não encontrada' }
  }

  // Permissão pelo nível do kanban (editável em /permissoes).
  // O operador é sempre limitado à OP que é dele, mesmo com "controle total".
  const nivelKanban = await nivelDaAreaPara(user.role, 'kanban')
  if (!podeEscrever(nivelKanban)) {
    return { success: false, error: 'Sem permissão pra mover OPs no kanban' }
  }
  // O operador age em qualquer OP da estação dele, não só na que pegou —
  // e ao agir ele VIRA o responsável (ver `assumiu` abaixo).
  let assumiu = false
  if (user.role === 'operador') {
    const permissao = await operadorPodeAgirNaOrdem(user.id, atual.maquinaId)
    if (!permissao.pode) {
      return { success: false, error: permissao.erro }
    }
    assumiu = atual.responsavelId !== user.id
  }

  if (atual.status === data.status) {
    return { success: true, message: 'Status mantido' }
  }

  // ⚠️ AS TRÊS PORTAS PRÓPRIAS. Este é o caminho GENÉRICO — arrastar card,
  // Status manual — e ele não sabe perguntar máquina nem quantidade. Pra
  // `em_producao` ele recusa sempre; pra `pronto_envio` e `enviado`, só
  // aceita OP que já tem apontamento (e `enviado` só a partir de
  // `pronto_envio`). A frase e a regra são as de transicoes-da-op.ts, as
  // mesmas que a tela usa pra decidir o que oferecer.
  const precisaDoApontamento =
    data.status === 'pronto_envio' || data.status === 'enviado'
  const erroDaPorta = erroDaTransicaoGenerica(
    atual.status,
    data.status,
    precisaDoApontamento ? await temApontamento(id) : false,
  )
  if (erroDaPorta) return { success: false, error: erroDaPorta }

  // ⚠️ A BAIXA TEM EFEITO PRÓPRIO — status, data de fim, histórico e
  // entrada no estoque — e mora em src/lib/db/baixa-da-op.ts, a mesma função
  // que o DESPACHO da remessa usa. As duas não podem dar baixa de jeitos
  // diferentes.
  if (data.status === 'enviado') {
    const gravou = await db.transaction((tx) =>
      gravarBaixa(tx, atual, {
        usuarioId: user.id,
        observacao: data.observacao ?? null,
        ...(assumiu ? { responsavelId: user.id } : {}),
      }),
    )
    if (!gravou) {
      return {
        success: false,
        error: 'Alguém mexeu nessa OP agora mesmo. Atualize a tela.',
      }
    }
    revalidatePath('/ordens')
    revalidatePath(`/ordens/${id}`)
    revalidatePath('/producao')
    revalidatePath('/estoque')
    revalidatePath('/remessas')
    return { success: true, message: 'Status atualizado', assumiu }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ordensProducao)
      .set({
        status: data.status,
        // A OP SEGUE O OPERADOR QUE MEXEU POR ÚLTIMO. É assim que a virada de
        // turno fica registrada sozinha: o operador 1 sai no meio, o 2
        // continua, e a OP passa a mostrar o 2.
        //
        // ADMIN E GERENTE NÃO TOMAM A OP: `assumiu` só fica true pra
        // role === 'operador'. Eles interagem, a interação vai pro
        // eventos_kanban, mas a posse continua do chão da estação — é o que
        // mantém o relatório dizendo quem estava na máquina.
        ...(assumiu ? { responsavelId: user.id } : {}),
        dataRealInicio:
          atual.dataRealInicio === null && data.status === 'em_producao'
            ? new Date()
            : atual.dataRealInicio,
      })
      .where(eq(ordensProducao.id, id))

    await tx.insert(eventosKanban).values({
      ordemId: id,
      statusAnterior: atual.status,
      statusNovo: data.status,
      usuarioId: user.id,
      observacao: data.observacao ?? null,
    })
  })

  revalidatePath('/ordens')
  revalidatePath(`/ordens/${id}`)
  revalidatePath('/producao')
  revalidatePath('/estoque')
  return { success: true, message: 'Status atualizado', assumiu }
}

// A OP tem ao menos um apontamento? É a exceção das portas de `pronto_envio`
// e `enviado` — ver transicoes-da-op.ts.
async function temApontamento(ordemId: string): Promise<boolean> {
  const [linha] = await db
    .select({ id: apontamentosProducao.id })
    .from(apontamentosProducao)
    .where(eq(apontamentosProducao.ordemId, ordemId))
    .limit(1)
  return linha !== undefined
}

// -----------------------------------------------------------------
// Histórico da OP (leitura pura — nenhuma tabela nova)
// -----------------------------------------------------------------
// `eventos_kanban` grava desde sempre usuario_id, status_anterior,
// status_novo, observacao e created_at a cada movimento — são 9 pontos no
// código escrevendo nela. E até aqui NADA no sistema lia isso pra exibir: a
// única leitura era um MAX(created_at) em producao/actions.ts pra calcular
// tempo parado na etapa. Era uma trilha de auditoria completa e invisível.
//
// Os apontamentos entram na MESMA linha do tempo porque também têm autor e
// hora; separados, cada metade conta metade da história.
//
// É isto que responde "o admin/gerente mexeu nessa OP?" — justamente o caso
// que o item C deixa acontecer sem trocar o responsável.

export type ItemDoHistorico = {
  em: Date
  autorNome: string | null
} & (
  | {
      tipo: 'status'
      statusAnterior: (typeof statusValues)[number] | null
      statusNovo: (typeof statusValues)[number]
      observacao: string | null
    }
  | {
      tipo: 'apontamento'
      produzida: number
      refugo: number
    }
)

export async function historicoDaOrdem(
  ordemId: string,
): Promise<ItemDoHistorico[]> {
  await requireAuth()
  if (!uuidRe.test(ordemId)) return []

  const autor = alias(users, 'autor_do_evento')

  const [eventos, apontamentos] = await Promise.all([
    db
      .select({
        em: eventosKanban.createdAt,
        autorNome: autor.nome,
        statusAnterior: eventosKanban.statusAnterior,
        statusNovo: eventosKanban.statusNovo,
        observacao: eventosKanban.observacao,
      })
      .from(eventosKanban)
      .leftJoin(autor, eq(autor.id, eventosKanban.usuarioId))
      .where(eq(eventosKanban.ordemId, ordemId)),
    db
      .select({
        em: apontamentosProducao.createdAt,
        autorNome: users.nome,
        produzida: apontamentosProducao.quantidadeProduzida,
        refugo: apontamentosProducao.quantidadeRefugo,
      })
      .from(apontamentosProducao)
      .leftJoin(users, eq(users.id, apontamentosProducao.operadorId))
      .where(eq(apontamentosProducao.ordemId, ordemId)),
  ])

  const itens: ItemDoHistorico[] = [
    ...eventos.map(
      (e): ItemDoHistorico => ({
        tipo: 'status',
        em: e.em,
        autorNome: e.autorNome ?? null,
        statusAnterior: e.statusAnterior,
        statusNovo: e.statusNovo,
        observacao: e.observacao,
      }),
    ),
    ...apontamentos.map(
      (a): ItemDoHistorico => ({
        tipo: 'apontamento',
        em: a.em,
        autorNome: a.autorNome ?? null,
        produzida: a.produzida,
        refugo: a.refugo,
      }),
    ),
  ]

  // Cronológica INVERSA: o que aconteceu por último aparece primeiro.
  return itens.sort((a, b) => b.em.getTime() - a.em.getTime())
}

// -----------------------------------------------------------------
// Pegar / soltar OP (fluxo puxado: operador assume a OP da fila)
// -----------------------------------------------------------------

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Máquina de uma estação, com quem está nela agora.
export type MaquinaParaPegar = {
  id: string
  codigo: string
  nome: string
  // Pra o diálogo do gerente agrupar por estação. O operador já recebe só as
  // da estação dele, então pra ele o valor se repete e o diálogo não agrupa.
  estacaoNome: string | null
  // Número da OP que está EM PRODUÇÃO nesta máquina, ou null se está livre.
  ocupadaPorOp: string | null
  /**
   * Por que esta máquina não pode receber OP agora (manutenção, setup,
   * desativada), ou null.
   *
   * ⚠️ Vem de `motivoDeImpedimento`, a MESMA função que
   * `validarMaquinaParaOrdem` usa pra recusar no servidor. Antes o seletor
   * só sabia de ocupação: oferecia a máquina em manutenção como se estivesse
   * livre, e o toque voltava com erro. Oferecer o que o servidor recusa é a
   * pior forma de erro — parece bug da pessoa, não da tela.
   */
  impedimento: string | null
}

export type MaquinasParaPegar = {
  estacaoNome: string | null
  maquinas: MaquinaParaPegar[]
}

/**
 * As máquinas que o usuário pode escolher ao pegar uma OP.
 *
 * Operador: só as da estação dele. Admin/gerente não têm estação, então
 * recebem todas as vivas — é a lista do "Em qual máquina?" do board, que
 * agrupa por `estacaoNome`.
 *
 * O left join não pode duplicar linha de máquina: o índice único
 * `ordens_producao_maquina_em_producao_uidx` (migration 50) garante no máximo
 * uma OP em produção por máquina.
 */
export async function listarMaquinasParaPegar(): Promise<
  ActionResult<MaquinasParaPegar>
> {
  const user = await requireAuth()
  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão no kanban' }
  }

  let estacaoNome: string | null = null
  let filtroDeEstacao
  if (user.role === 'operador') {
    const estacao = await estacaoDoOperador(user.id)
    if (!estacao) {
      return {
        success: false,
        error: 'Você não está em nenhuma estação — fale com o admin',
      }
    }
    estacaoNome = estacao.nome
    filtroDeEstacao = eq(maquinas.estacaoId, estacao.id)
  }

  const rows = await db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      status: maquinas.status,
      ocupadaPorOp: ordensProducao.numero,
      estacaoNome: estacoes.nome,
    })
    .from(maquinas)
    .leftJoin(estacoes, eq(estacoes.id, maquinas.estacaoId))
    .leftJoin(
      ordensProducao,
      and(
        eq(ordensProducao.maquinaId, maquinas.id),
        // "Ocupada" é `em_producao`, e não "status ativo": é o único status
        // em que a OP está FISICAMENTE na máquina. Com "ativo", a OP parada
        // em pronto_envio seguiria segurando a máquina e, com o tempo, todas
        // ficariam ocupadas sem ninguém produzindo — o sistema travaria
        // sozinho. Mover pra pronto_envio libera.
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .where(and(isNull(maquinas.deletedAt), filtroDeEstacao))
    .orderBy(asc(maquinas.codigo))

  return {
    success: true,
    data: {
      estacaoNome,
      maquinas: rows.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nome: r.nome,
        estacaoNome: r.estacaoNome ?? null,
        ocupadaPorOp: r.ocupadaPorOp ?? null,
        impedimento: motivoDeImpedimento(r.status),
      })),
    },
  }
}

/**
 * Revalida a máquina no SERVIDOR. O diálogo do cliente é conveniência: quem
 * decide é isto aqui. Devolve a mensagem de erro, ou null se está tudo certo.
 */
type MaquinaValidada = { erro: string } | { erro: null; codigo: string }

async function validarMaquinaParaOrdem(
  maquinaId: string,
  estacaoId: string | null,
  ordemId: string,
): Promise<MaquinaValidada> {
  if (!uuidRe.test(maquinaId)) return { erro: 'Máquina inválida' }

  const [maquina] = await db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      status: maquinas.status,
    })
    .from(maquinas)
    .where(
      and(
        eq(maquinas.id, maquinaId),
        isNull(maquinas.deletedAt),
        estacaoId ? eq(maquinas.estacaoId, estacaoId) : undefined,
      ),
    )
    .limit(1)
  if (!maquina) {
    return {
      erro: estacaoId
        ? 'Essa máquina não é da sua estação'
        : 'Máquina não encontrada',
    }
  }

  // MÁQUINA EM MANUTENÇÃO OU DESATIVADA NÃO RECEBE OP, e a regra é a mesma
  // que apaga o cartão do operador — `motivoDeImpedimento`, em
  // src/lib/producao/estado-maquina.ts. Aqui é o lado que VALE: o cartão só
  // esconde o botão, e o kanban do gerente chega nesta mesma action por
  // outro caminho.
  //
  // ⚠️ Vale pra TODO MUNDO, admin incluído, e não é descuido de permissão: o
  // impedimento é FÍSICO, não hierárquico. A máquina está desmontada — quem
  // pode mais não faz a peça sair dela. Planejar continua livre: criar e
  // editar OP não passam por aqui, então o gerente segue podendo deixar uma
  // OP apontada pra máquina que volta da manutenção amanhã. O que ele não
  // faz é PÔR EM PRODUÇÃO agora.
  const impedimento = motivoDeImpedimento(maquina.status)
  if (impedimento) {
    return {
      erro: `A máquina ${maquina.codigo} ${impedimento} e não pode receber OP`,
    }
  }

  const [ocupada] = await db
    .select({ numero: ordensProducao.numero })
    .from(ordensProducao)
    .where(
      and(
        eq(ordensProducao.maquinaId, maquinaId),
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.id, ordemId),
      ),
    )
    .limit(1)
  if (ocupada) {
    return {
      erro: `A máquina ${maquina.codigo} já está com a OP ${ocupada.numero}`,
    }
  }
  return { erro: null, codigo: maquina.codigo }
}

// DUAS OPs NA MESMA MÁQUINA: a checagem acima tem janela entre o SELECT e o
// UPDATE. Quem fecha de verdade é o índice único do banco; isto só traduz o
// 23505 pra português.
function ehConflitoDeMaquina(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false
  const e = erro as { code?: string; constraint_name?: string }
  return (
    e.code === '23505' &&
    e.constraint_name === 'ordens_producao_maquina_em_producao_uidx'
  )
}

// A MESMA OP EM DUAS MÁQUINAS — o outro lado, que o índice único NÃO pega.
//
// teste1 toca em Iniciar na TC-01 e escolhe a OP-2026-0042; teste2, no mesmo
// segundo, toca na TC-02 e escolhe a MESMA OP. Os dois SELECT leem
// `responsavel_id = null`; as duas máquinas são diferentes e estão livres,
// então as duas validações passam; os dois UPDATE gravam. Uma linha só, o
// último vence — e OS DOIS RECEBEM "sucesso". Um dos operadores anda até a
// máquina dele e não tem nada lá.
//
// O índice único não ajuda aqui: ele impede duas OPs numa máquina, e isto é
// uma OP em duas máquinas. Quem fecha é o UPDATE condicional lá embaixo, que
// exige a OP ainda estar como foi lida. Zero linhas de volta = alguém
// chegou antes, e aí a resposta é uma recusa, não um sucesso falso.
class ConflitoDeOrdem extends Error {}

/**
 * "Pegar pra mim" — fluxo puxado. Só pra OP SEM responsável.
 *
 * ESCOLHER MÁQUINA É OBRIGATÓRIO quando a OP ainda não tem uma: é isso que
 * torna verdadeira a premissa do item C (OP em produção sempre tem máquina,
 * logo sempre tem estação). Se a OP já tem máquina, não pergunta de novo —
 * a máquina dela é a resposta.
 *
 * `materiaPrimaConfirmada` é a resposta do operador à pergunta de
 * `confirmacaoAntesDeIniciar` (src/lib/producao/inicio-da-op.ts). Só o
 * OPERADOR precisa dela; ver o comentário lá sobre por que o gerente não.
 */
export async function pegarOrdemAction(
  id: string,
  maquinaId?: string,
  opcoes: { materiaPrimaConfirmada?: boolean } = {},
): Promise<ActionResult> {
  const user = await requireAuth()
  // Tablet travado não grava — ver src/lib/auth/inatividade.ts.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão pra pegar OPs no kanban' }
  }

  const [atual] = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      responsavelId: ordensProducao.responsavelId,
      maquinaId: ordensProducao.maquinaId,
      dataRealInicio: ordensProducao.dataRealInicio,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'OP não encontrada' }

  if (atual.responsavelId && atual.responsavelId !== user.id) {
    return { success: false, error: 'Essa OP já foi pega por outro operador' }
  }

  // STATUS QUE PODE ENTRAR NUMA MÁQUINA. A lista mora em
  // src/lib/producao/inicio-da-op.ts, a mesma que a consulta usa pra montar
  // o que aparece no diálogo — assim a tela nunca oferece o que a action
  // recusa, nem a action aceita o que a tela nunca mostraria (esta função é
  // um endpoint: dá pra chamá-la sem passar por tela nenhuma).
  //
  // Na prática isto barra `acabamento` em diante: pegar uma OP que já saiu
  // da máquina não tem o que significar — a máquina foi liberada de
  // propósito quando ela virou pronto_envio.
  if (!podeIniciar(atual.status)) {
    return {
      success: false,
      error: `OP em "${STATUS_LABEL_CURTO[atual.status]}" não entra em máquina`,
    }
  }

  // A CONFIRMAÇÃO DA MATÉRIA-PRIMA, exigida no SERVIDOR e não só na tela.
  // Só pro operador — o porquê está em inicio-da-op.ts.
  const precisaConfirmar =
    user.role === 'operador' && confirmacaoAntesDeIniciar(atual.status) !== null
  if (precisaConfirmar && !opcoes.materiaPrimaConfirmada) {
    return {
      success: false,
      error: 'Confirme a matéria-prima antes de iniciar esta OP',
    }
  }

  // Só o OPERADOR é preso à estação. Admin e gerente não têm estação e
  // continuam podendo interagir — o botão é que some pra eles na tela.
  let estacaoId: string | null = null
  if (user.role === 'operador') {
    const estacao = await estacaoDoOperador(user.id)
    if (!estacao) {
      return {
        success: false,
        error: 'Você não está em nenhuma estação — fale com o admin',
      }
    }
    estacaoId = estacao.id
  }

  const maquinaEscolhida = atual.maquinaId ?? maquinaId ?? null
  if (!maquinaEscolhida) {
    return { success: false, error: 'Escolha uma máquina pra pegar a OP' }
  }
  const maquinaValidada = await validarMaquinaParaOrdem(
    maquinaEscolhida,
    estacaoId,
    id,
  )
  if (maquinaValidada.erro !== null) {
    return { success: false, error: maquinaValidada.erro }
  }

  // Ao pegar a OP, ela já entra em produção se ainda estava na fila
  // (registra o evento no kanban e marca o início real da produção).
  const entraEmProducao = atual.status !== 'em_producao'

  // A observação do evento diz O QUE ACONTECEU, e os dois casos são
  // diferentes: a OP normal ENTRA em produção; a que já estava em produção
  // sem máquina só GANHA a máquina. Antes o segundo caso não gerava evento
  // nenhum, então a OP mudava de lugar no chão de fábrica e o histórico
  // ficava mudo.
  const observacao = entraEmProducao
    ? opcoes.materiaPrimaConfirmada && precisaConfirmar
      ? OBSERVACAO_DE_MATERIA_PRIMA
      : 'Entrou em produção ao ser pega pelo operador'
    : observacaoDeMaquinaAtribuida(maquinaValidada.codigo)

  try {
    await db.transaction(async (tx) => {
      // ⚠️ UPDATE CONDICIONAL, e é o que impede a mesma OP de ser "pega" por
      // dois operadores em máquinas diferentes. O WHERE repete o que o
      // SELECT lá em cima leu: se responsável, máquina ou status mudaram
      // nesse meio-tempo, nenhuma linha volta e a operação inteira é
      // desfeita. Ver o comentário de ConflitoDeOrdem.
      const gravadas = await tx
        .update(ordensProducao)
        .set({
          responsavelId: user.id,
          maquinaId: maquinaEscolhida,
          ...(entraEmProducao
            ? {
                status: 'em_producao' as const,
                dataRealInicio: atual.dataRealInicio ?? new Date(),
              }
            : {}),
        })
        .where(
          and(
            eq(ordensProducao.id, id),
            isNull(ordensProducao.deletedAt),
            eq(ordensProducao.status, atual.status),
            atual.responsavelId === null
              ? isNull(ordensProducao.responsavelId)
              : eq(ordensProducao.responsavelId, atual.responsavelId),
            atual.maquinaId === null
              ? isNull(ordensProducao.maquinaId)
              : eq(ordensProducao.maquinaId, atual.maquinaId),
          ),
        )
        .returning({ id: ordensProducao.id })

      if (gravadas.length === 0) throw new ConflitoDeOrdem()

      await tx.insert(eventosKanban).values({
        ordemId: id,
        statusAnterior: atual.status,
        statusNovo: entraEmProducao ? 'em_producao' : atual.status,
        usuarioId: user.id,
        observacao,
      })
    })
  } catch (erro) {
    if (erro instanceof ConflitoDeOrdem) {
      return {
        success: false,
        error: 'Outro operador pegou essa OP agora mesmo. Escolha outra.',
      }
    }
    if (ehConflitoDeMaquina(erro)) {
      return {
        success: false,
        error: 'Alguém pegou essa máquina agora mesmo. Escolha outra.',
      }
    }
    throw erro
  }

  revalidatePath('/producao')
  revalidatePath('/ordens')
  return {
    success: true,
    message: entraEmProducao
      ? 'OP é sua e entrou em produção'
      : `OP é sua, na máquina ${maquinaValidada.codigo}`,
  }
}

// -----------------------------------------------------------------
// INICIAR NA MÁQUINA — a porta do GERENTE pra `em_producao`
// -----------------------------------------------------------------
//
// Irmã de `pegarOrdemAction`, e separada dela de propósito. As duas põem a
// OP numa máquina, mas o `pegar` é inteiro sobre o operador — e o gerente
// difere em quatro pontos que virariam quatro `if` de papel lá dentro, com
// os comentários de lá passando a mentir:
//
//   - O GERENTE NÃO VIRA RESPONSÁVEL. Ele planeja; a posse é do chão da
//     estação, e o relatório de quem estava na máquina depende disso.
//   - "Já foi pega por outro operador" não se aplica: ele move a OP de
//     qualquer um, que é o que o kanban sempre permitiu a ele.
//   - A MÁQUINA ESCOLHIDA VENCE a planejada. No `pegar`, a máquina que a OP já
//     tem é a resposta; aqui ela só vem pré-selecionada no diálogo.
//   - Sem confirmação de matéria-prima — o porquê está em inicio-da-op.ts.
//
// O que é IGUAL fica compartilhado: `podeIniciar` (o que entra em máquina),
// `validarMaquinaParaOrdem` (impedimento e ocupação, que valem pra todo
// mundo — são físicos), o UPDATE condicional e a tradução do índice único.
export async function iniciarProducaoAction(
  id: string,
  maquinaId: string,
): Promise<ActionResult> {
  const user = await requireAuth()
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão no kanban' }
  }
  // O operador tem a porta dele (`pegarOrdemAction`), que o torna dono e o
  // prende à estação. Deixá-lo passar por aqui pularia as duas coisas.
  if (!isManagerRole(user.role)) {
    return { success: false, error: 'Só gerente ou admin inicia OP pelo board' }
  }

  const [atual] = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      maquinaId: ordensProducao.maquinaId,
      dataRealInicio: ordensProducao.dataRealInicio,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'OP não encontrada' }

  if (!podeIniciar(atual.status)) {
    return {
      success: false,
      error: `OP em "${STATUS_LABEL_CURTO[atual.status]}" não entra em máquina`,
    }
  }

  // `em_producao` só chega aqui como OP LEGADA sem máquina — a que entrou em
  // produção pelo arrastar antigo, que não perguntava máquina. Com máquina,
  // ela já está onde deveria.
  const entraEmProducao = atual.status !== 'em_producao'
  if (!entraEmProducao && atual.maquinaId) {
    return { success: false, error: 'Essa OP já está em produção numa máquina' }
  }

  const maquinaValidada = await validarMaquinaParaOrdem(maquinaId, null, id)
  if (maquinaValidada.erro !== null) {
    return { success: false, error: maquinaValidada.erro }
  }

  try {
    await db.transaction(async (tx) => {
      // Mesmo cadeado do `pegar`: se status ou máquina mudaram desde a
      // leitura, nenhuma linha volta e nada é gravado.
      const gravadas = await tx
        .update(ordensProducao)
        .set({
          maquinaId,
          ...(entraEmProducao
            ? {
                status: 'em_producao' as const,
                dataRealInicio: atual.dataRealInicio ?? new Date(),
              }
            : {}),
        })
        .where(
          and(
            eq(ordensProducao.id, id),
            isNull(ordensProducao.deletedAt),
            eq(ordensProducao.status, atual.status),
            atual.maquinaId === null
              ? isNull(ordensProducao.maquinaId)
              : eq(ordensProducao.maquinaId, atual.maquinaId),
          ),
        )
        .returning({ id: ordensProducao.id })
      if (gravadas.length === 0) throw new ConflitoDeOrdem()

      await tx.insert(eventosKanban).values({
        ordemId: id,
        statusAnterior: atual.status,
        statusNovo: 'em_producao',
        usuarioId: user.id,
        observacao: entraEmProducao
          ? `Iniciada na máquina ${maquinaValidada.codigo}`
          : observacaoDeMaquinaAtribuida(maquinaValidada.codigo),
      })
    })
  } catch (erro) {
    if (erro instanceof ConflitoDeOrdem) {
      return {
        success: false,
        error: 'Alguém mexeu nessa OP agora mesmo. Atualize a tela.',
      }
    }
    if (ehConflitoDeMaquina(erro)) {
      return {
        success: false,
        error: `A máquina ${maquinaValidada.codigo} foi ocupada agora mesmo. Escolha outra.`,
      }
    }
    throw erro
  }

  revalidatePath('/producao')
  revalidatePath('/ordens')
  revalidatePath(`/ordens/${id}`)
  revalidatePath('/fabrica')
  return {
    success: true,
    message: `OP em produção na ${maquinaValidada.codigo}`,
  }
}

// -----------------------------------------------------------------
// MUDAR DESTINO — a OP de remessa vai pra outro Full, ou pro estoque
// -----------------------------------------------------------------
//
// O Full da semana saiu sem esta OP, ou o cliente do marketplace desistiu:
// a peça existe, e a pergunta é pra onde ela vai. Sem esta porta, o caminho
// era cancelar e recriar — perdendo o histórico de produção dela.
//
//   outra remessa — do MESMO canal, não excluída, com envio de hoje em
//                   diante (inclusive a que ainda não tem OP: o Full da
//                   semana que vem). A OP herda o prazo da produção dela.
//   estoque       — sai da remessa, o canal vira `estoque` e fica sem prazo.
//
// Só OP sem baixa e não cancelada: a que teve baixa já foi embora no
// caminhão. O histórico ganha uma linha sem transição dizendo de onde pra
// onde — o relógio do aging ignora esse tipo de evento.

export type DestinoDaOrdem = { tipo: 'remessa'; remessaId: string } | { tipo: 'estoque' }

export type RemessaDestino = { id: string; rotulo: string; producaoAte: string }

/** As remessas pra onde esta OP pode ir. Leitura, pro diálogo. */
export async function listarDestinosDaOrdem(
  ordemId: string,
): Promise<RemessaDestino[]> {
  await requireArea('ordens')
  if (!uuidRe.test(ordemId)) return []

  const [op] = await db
    .select({
      canal: ordensProducao.canalDestino,
      remessaFullId: ordensProducao.remessaFullId,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, ordemId), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!op?.remessaFullId) return []

  const rows = await db
    .select({
      id: remessasFull.id,
      canal: remessasFull.canal,
      dataEnvio: remessasFull.dataEnvio,
      producaoAte: remessasFull.producaoAte,
    })
    .from(remessasFull)
    .where(
      and(
        isNull(remessasFull.deletedAt),
        eq(remessasFull.canal, op.canal),
        ne(remessasFull.id, op.remessaFullId),
        sql`${remessasFull.dataEnvio} >= ${hojeEmBrasilia()}`,
      ),
    )
    .orderBy(asc(remessasFull.dataEnvio))

  return rows.map((r) => ({
    id: r.id,
    rotulo: rotuloDaRemessa(r.canal, r.dataEnvio),
    producaoAte: producaoAteEfetivo(r),
  }))
}

export async function mudarDestinoDaOrdemAction(
  ordemId: string,
  destino: DestinoDaOrdem,
): Promise<ActionResult> {
  const user = await requireAreaEscrita('ordens')
  if (!uuidRe.test(ordemId)) return { success: false, error: 'ID inválido' }

  const [op] = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      canal: ordensProducao.canalDestino,
      remessaFullId: ordensProducao.remessaFullId,
      remessaCanal: remessasFull.canal,
      remessaDataEnvio: remessasFull.dataEnvio,
    })
    .from(ordensProducao)
    .leftJoin(remessasFull, eq(remessasFull.id, ordensProducao.remessaFullId))
    .where(and(eq(ordensProducao.id, ordemId), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!op) return { success: false, error: 'OP não encontrada' }
  if (!op.remessaFullId) {
    return { success: false, error: 'Essa OP não é de nenhuma remessa' }
  }
  if (op.status === 'enviado') {
    return { success: false, error: 'Essa OP já teve baixa: foi embora com a remessa' }
  }
  if (op.status === 'cancelado') {
    return { success: false, error: 'Essa OP está cancelada' }
  }

  const origem =
    op.remessaCanal && op.remessaDataEnvio
      ? rotuloDaRemessa(op.remessaCanal, op.remessaDataEnvio)
      : 'remessa'

  let alvo: { remessaFullId: string | null; canal: typeof op.canal; prazo: Date | null; rotulo: string }
  if (destino.tipo === 'estoque') {
    alvo = { remessaFullId: null, canal: 'estoque', prazo: null, rotulo: 'Estoque' }
  } else {
    if (!uuidRe.test(destino.remessaId)) return { success: false, error: 'Remessa inválida' }
    const [r] = await db
      .select({
        id: remessasFull.id,
        canal: remessasFull.canal,
        dataEnvio: remessasFull.dataEnvio,
        producaoAte: remessasFull.producaoAte,
      })
      .from(remessasFull)
      .where(and(eq(remessasFull.id, destino.remessaId), isNull(remessasFull.deletedAt)))
      .limit(1)
    if (!r) return { success: false, error: 'Remessa não encontrada' }
    if (r.id === op.remessaFullId) {
      return { success: false, error: 'A OP já está nessa remessa' }
    }
    if (r.canal !== op.canal) {
      return { success: false, error: 'A remessa é de outro canal' }
    }
    if (r.dataEnvio < hojeEmBrasilia()) {
      return { success: false, error: 'O envio dessa remessa já passou' }
    }
    alvo = {
      remessaFullId: r.id,
      canal: r.canal,
      prazo: prazoDaOp(producaoAteEfetivo(r)),
      rotulo: rotuloDaRemessa(r.canal, r.dataEnvio),
    }
  }

  const gravou = await db.transaction(async (tx) => {
    // Condicional na remessa e no status lidos: se alguém deu baixa ou
    // mudou o destino no meio, nada muda.
    const linhas = await tx
      .update(ordensProducao)
      .set({
        remessaFullId: alvo.remessaFullId,
        canalDestino: alvo.canal,
        dataPrevistaFim: alvo.prazo,
      })
      .where(
        and(
          eq(ordensProducao.id, ordemId),
          isNull(ordensProducao.deletedAt),
          eq(ordensProducao.status, op.status),
          eq(ordensProducao.remessaFullId, op.remessaFullId!),
        ),
      )
      .returning({ id: ordensProducao.id })
    if (linhas.length === 0) return false

    await tx.insert(eventosKanban).values({
      ordemId,
      statusAnterior: op.status,
      statusNovo: op.status,
      usuarioId: user.id,
      observacao: `Destino: ${origem} → ${alvo.rotulo}`,
    })
    return true
  })
  if (!gravou) {
    return { success: false, error: 'Alguém mexeu nessa OP agora mesmo. Atualize a tela.' }
  }

  revalidatePath('/ordens')
  revalidatePath('/producao')
  revalidatePath('/remessas')
  revalidatePath('/estoque')
  return { success: true, message: `OP agora vai pra ${alvo.rotulo}` }
}

export async function soltarOrdemAction(id: string): Promise<ActionResult> {
  const user = await requireAuth()
  // Tablet travado não grava — ver src/lib/auth/inatividade.ts.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão no kanban' }
  }

  const [atual] = await db
    .select({
      id: ordensProducao.id,
      responsavelId: ordensProducao.responsavelId,
      maquinaId: ordensProducao.maquinaId,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'OP não encontrada' }

  // O operador solta qualquer OP da estação dele — inclusive a que o colega
  // pegou. Gerente e admin soltam qualquer uma.
  if (user.role === 'operador') {
    const permissao = await operadorPodeAgirNaOrdem(user.id, atual.maquinaId)
    if (!permissao.pode) {
      return { success: false, error: permissao.erro }
    }
  } else if (
    !isManagerRole(user.role) &&
    atual.responsavelId &&
    atual.responsavelId !== user.id
  ) {
    return { success: false, error: 'Só quem pegou pode soltar' }
  }

  // SOLTAR NÃO TOMA A OP. É a exceção à regra do "a OP segue quem mexeu" —
  // esta ação existe justamente pra LIMPAR o responsável.

  await db
    .update(ordensProducao)
    .set({ responsavelId: null })
    .where(eq(ordensProducao.id, id))

  revalidatePath('/producao')
  revalidatePath('/ordens')
  return { success: true, message: 'OP voltou pra fila' }
}

// -----------------------------------------------------------------
// Apontar produção + listar apontamentos
// -----------------------------------------------------------------

export type ApontamentoItem = {
  id: string
  operadorNome: string | null
  produzida: number
  refugo: number
  em: Date
}

export async function listarApontamentos(ordemId: string): Promise<{
  itens: ApontamentoItem[]
  totalProduzido: number
  totalRefugo: number
}> {
  await requireAuth()
  if (!uuidRe.test(ordemId)) {
    return { itens: [], totalProduzido: 0, totalRefugo: 0 }
  }

  const rows = await db
    .select({
      id: apontamentosProducao.id,
      produzida: apontamentosProducao.quantidadeProduzida,
      refugo: apontamentosProducao.quantidadeRefugo,
      em: apontamentosProducao.inicio,
      operadorNome: users.nome,
    })
    .from(apontamentosProducao)
    .leftJoin(users, eq(users.id, apontamentosProducao.operadorId))
    .where(eq(apontamentosProducao.ordemId, ordemId))
    .orderBy(desc(apontamentosProducao.inicio))

  const itens: ApontamentoItem[] = rows.map((r) => ({
    id: r.id,
    operadorNome: r.operadorNome ?? null,
    produzida: r.produzida,
    refugo: r.refugo,
    em: r.em,
  }))
  return {
    itens,
    totalProduzido: itens.reduce((s, i) => s + i.produzida, 0),
    totalRefugo: itens.reduce((s, i) => s + i.refugo, 0),
  }
}

export async function apontarProducaoAction(
  ordemId: string,
  input: ApontamentoInput,
): Promise<ActionResult> {
  const user = await requireAuth()
  // Tablet travado não grava — ver src/lib/auth/inatividade.ts.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado
  if (!uuidRe.test(ordemId)) return { success: false, error: 'ID inválido' }

  const parsed = apontamentoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [op] = await db
    .select({
      id: ordensProducao.id,
      responsavelId: ordensProducao.responsavelId,
      maquinaId: ordensProducao.maquinaId,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, ordemId), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!op) return { success: false, error: 'OP não encontrada' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão pra apontar produção' }
  }
  // Mesma regra do mover: é da estação dele, e apontar TOMA a OP.
  let assumiu = false
  if (user.role === 'operador') {
    const permissao = await operadorPodeAgirNaOrdem(user.id, op.maquinaId)
    if (!permissao.pode) {
      return { success: false, error: permissao.erro }
    }
    assumiu = op.responsavelId !== user.id
  } else if (!isManagerRole(user.role) && op.responsavelId !== user.id) {
    return { success: false, error: 'Pegue a OP pra você antes de apontar' }
  }

  const agora = new Date()
  await db.insert(apontamentosProducao).values({
    ordemId,
    operadorId: user.id,
    inicio: agora,
    fim: agora,
    quantidadeProduzida: data.produzida,
    quantidadeRefugo: data.refugo,
  })

  revalidatePath('/producao')
  // Admin e gerente apontam sem tomar a OP — a posse fica com o operador.
  if (assumiu) {
    await db
      .update(ordensProducao)
      .set({ responsavelId: user.id })
      .where(eq(ordensProducao.id, ordemId))
  }

  revalidatePath('/dashboard')
  revalidatePath(`/ordens/${ordemId}`)
  return { success: true, message: 'Apontamento registrado', assumiu }
}

// -----------------------------------------------------------------
// CONCLUIR PRODUÇÃO — o registro e o fim da OP, numa transação só
// -----------------------------------------------------------------
//
// Substitui, no fluxo do operador, o par "Apontar produção" + "Terminei".
// Eram duas actions e duas transações independentes, e é isso que o gesto
// único conserta: dava pra apontar e a tela cair antes do terminar (número
// gravado, máquina ainda ocupada), ou terminar sem apontar (máquina livre,
// número que nunca existiu). Nenhum dos dois estados é recuperável pela
// tela do operador, e os dois são fáceis de criar sem querer.
//
// ⚠️ A MÁQUINA LIBERA PORQUE O STATUS MUDOU, e as duas coisas estão na mesma
// transação. O índice único `ordens_producao_maquina_em_producao_uidx` só
// cobre `em_producao`, então sair pra `pronto_envio` solta a máquina — se o
// UPDATE não gravar, nada solta e nada foi registrado.
//
// ⚠️ IDEMPOTÊNCIA SEM COLUNA NOVA. O UPDATE exige `status = 'em_producao'`.
// Toque duplo, reenvio depois de queda de conexão e dois operadores na
// mesma OP caem todos no mesmo lugar: zero linhas, transação desfeita,
// NENHUM apontamento duplicado. Nenhuma migration, nenhuma chave de
// idempotência guardada.
//
// ⚠️ E O CONFLITO NÃO É ERRO — é informação. Quando a conexão cai DEPOIS de
// salvar, o operador aperta de novo; um "falhou" ali seria mentira sobre uma
// operação que deu certo, e ele registraria de novo por outro caminho. Por
// isso a recusa por "já concluída" volta como `success: true` com aviso,
// e não como erro.
//
// ⚠️ NÃO FINALIZA NADA COMERCIAL. Vai pra `pronto_envio`, não pra
// `enviado` — quem gera `movimentacoes_estoque` é a passagem pra 'enviado',
// que continua sendo do gerente. (E `ordens_producao` não tem ligação
// nenhuma com orçamento ou pedido, então não há o que disparar.)

export type ConclusaoInput = { produzida: number; refugo: number }

export async function concluirProducaoAction(
  ordemId: string,
  input: ConclusaoInput,
  // `concluiu` separa a conclusão DE AGORA do "já estava concluída", que
  // também volta como sucesso. O board só oferece "Desfazer" pra primeira:
  // desfazer a segunda apagaria a conclusão de outra pessoa.
): Promise<ActionResult<{ concluiu: true }>> {
  const user = await requireAuth()
  // Tablet travado não grava — ver src/lib/auth/inatividade.ts.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado
  if (!uuidRe.test(ordemId)) return { success: false, error: 'ID inválido' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão pra concluir produção' }
  }

  const [op] = await db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      quantidade: ordensProducao.quantidade,
      responsavelId: ordensProducao.responsavelId,
      maquinaId: ordensProducao.maquinaId,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, ordemId), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!op) return { success: false, error: 'OP não encontrada' }

  // DE ONDE DÁ PRA CONCLUIR. O operador, só de `em_producao`: no tablet a OP
  // sai de uma máquina ou não sai de lugar nenhum. O gerente, de qualquer
  // coluna anterior — é a OP que saiu do tear enquanto o board ainda não
  // sabia dela (a virada do Trello). Fora disso, `concluidaAntes` diz a
  // verdade: já concluída, já com baixa, cancelada ou fora de produção.
  const gestor = isManagerRole(user.role)
  if (!podeConcluirProducao(op.status, gestor)) {
    return concluidaAntes(op.status)
  }
  // Concluída direto da fila, sem ter passado por máquina. A OP sai SEM
  // máquina: a planejada não foi onde a peça saiu, e deixá-la ali faria o
  // card mostrar um tear que nunca tocou nesta OP.
  const semMaquina = op.status !== 'em_producao'

  // Mesma regra do mover e do apontar: é da estação dele, e concluir TOMA a
  // OP — a virada de turno fica registrada sozinha.
  let assumiu = false
  if (user.role === 'operador') {
    const permissao = await operadorPodeAgirNaOrdem(user.id, op.maquinaId)
    if (!permissao.pode) return { success: false, error: permissao.erro }
    assumiu = op.responsavelId !== user.id
  } else if (!isManagerRole(user.role) && op.responsavelId !== user.id) {
    return { success: false, error: 'Pegue a OP pra você antes de concluir' }
  }

  try {
    let resumo = ''
    await db.transaction(async (tx) => {
      // ⚠️ O UPDATE CONDICIONAL VEM PRIMEIRO, E A ORDEM IMPORTA.
      //
      // Ele é o cadeado de tudo: idempotência, corrida entre operadores e
      // "libera a máquina só quando salvar". Mas está aqui em cima por outro
      // motivo, que custou um teste pra aparecer: com a validação de
      // quantidade na frente, DOIS OPERADORES CONCLUINDO A MESMA OP faziam o
      // segundo ler `jaRegistrado` já com as peças do primeiro, cair em
      // `restante = 0` e levar "o máximo agora é 0" — uma reclamação sobre
      // teto pra um problema que é de corrida. A mensagem certa é "já estava
      // concluída", e só o UPDATE sabe disso.
      //
      // Quem perde a corrida sai por aqui e nem chega a ser validado.
      const gravadas = await tx
        .update(ordensProducao)
        .set({
          status: 'pronto_envio' as const,
          ...(assumiu ? { responsavelId: user.id } : {}),
          ...(semMaquina ? { maquinaId: null } : {}),
        })
        .where(
          and(
            eq(ordensProducao.id, ordemId),
            isNull(ordensProducao.deletedAt),
            // O status LIDO, e não `em_producao` fixo: a conclusão do gerente
            // parte de outras colunas. O cadeado é o mesmo — mudou desde a
            // leitura, zero linhas.
            eq(ordensProducao.status, op.status),
          ),
        )
        .returning({ id: ordensProducao.id })
      if (gravadas.length === 0) throw new ConflitoDeOrdem()

      // O JÁ REGISTRADO É LIDO AQUI DENTRO, e não lá em cima: é ele que
      // define o teto, e um apontamento do gerente entrando entre a leitura
      // e a gravação deixaria o teto velho passar por cima da meta. Recusar
      // aqui desfaz o UPDATE junto — é a mesma transação.
      const [{ jaRegistrado }] = await tx
        .select({
          jaRegistrado: sql<number>`COALESCE(SUM(${apontamentosProducao.quantidadeProduzida}), 0)::int`,
        })
        .from(apontamentosProducao)
        .where(eq(apontamentosProducao.ordemId, ordemId))

      const conclusao = calcularConclusao(op.quantidade, jaRegistrado)
      // O TETO É SÓ DO OPERADOR (src/lib/producao/conclusao.ts): quem
      // planejou registra o que a fábrica de fato fez, mesmo acima da meta.
      const erro = erroDeQuantidade(input.produzida, input.refugo, conclusao, {
        teto: user.role === 'operador',
      })
      if (erro) throw new QuantidadeRecusada(erro)

      // Apontamento de 0 e 0 não vira linha: é o caso da OP que já tinha o
      // total registrado antes. Uma linha zerada só sujaria o histórico.
      if (input.produzida > 0 || input.refugo > 0) {
        const agora = new Date()
        await tx.insert(apontamentosProducao).values({
          ordemId,
          maquinaId: semMaquina ? null : op.maquinaId,
          operadorId: user.id,
          inicio: agora,
          fim: agora,
          quantidadeProduzida: input.produzida,
          quantidadeRefugo: input.refugo,
        })
      }

      // QUEM COMEÇOU, quando não foi quem está terminando. O
      // `eventos_kanban` é o único lugar que ainda sabe disso: o apontamento
      // é um só, no nome de quem concluiu, então sem esta linha a passagem
      // de turno some — a OP que o colega rodou seis horas sai inteira no
      // nome de quem apertou o botão. Ver o comentário de `resumoDaConclusao`.
      const [inicio] = await tx
        .select({ nome: users.nome, usuarioId: eventosKanban.usuarioId })
        .from(eventosKanban)
        .leftJoin(users, eq(users.id, eventosKanban.usuarioId))
        .where(
          and(
            eq(eventosKanban.ordemId, ordemId),
            eq(eventosKanban.statusNovo, 'em_producao'),
          ),
        )
        .orderBy(desc(eventosKanban.createdAt))
        .limit(1)
      // Sem máquina não houve início a nomear.
      const iniciadaPor =
        !semMaquina && inicio && inicio.usuarioId !== user.id
          ? inicio.nome
          : null

      resumo = resumoDaConclusao(
        input.produzida,
        input.refugo,
        conclusao,
        iniciadaPor,
        { semMaquina },
      )
      // `statusAnterior` é a ORIGEM real. É ela que identifica, numa análise
      // futura, as conclusões que não passaram por máquina — e é ela que
      // `desfazerConclusaoAction` lê pra saber pra onde devolver.
      await tx.insert(eventosKanban).values({
        ordemId,
        statusAnterior: op.status,
        statusNovo: 'pronto_envio',
        usuarioId: user.id,
        observacao: resumo,
      })
    })

    revalidatePath('/producao')
    revalidatePath('/dashboard')
    revalidatePath(`/ordens/${ordemId}`)
    return { success: true, message: resumo, assumiu, data: { concluiu: true } }
  } catch (erro) {
    if (erro instanceof QuantidadeRecusada) {
      return { success: false, error: erro.message }
    }
    if (erro instanceof ConflitoDeOrdem) {
      // Alguém mexeu entre o SELECT e o UPDATE — quase sempre outra
      // conclusão. Lê o status de agora pra responder a verdade: "já estava
      // concluída" quando foi isso, e não um erro que assusta.
      const [agora] = await db
        .select({ status: ordensProducao.status })
        .from(ordensProducao)
        .where(eq(ordensProducao.id, ordemId))
        .limit(1)
      return concluidaAntes(agora?.status ?? 'pronto_envio')
    }
    throw erro
  }
}

// -----------------------------------------------------------------
// DESFAZER A CONCLUSÃO — o caminho de volta do operador
// -----------------------------------------------------------------
//
// O erro que se comete no tablet é "fiz isso agora e foi errado": toquei sem
// querer, concluí a OP da máquina vizinha, confirmei os números
// pré-preenchidos sem ler. Todos se resolvem voltando atrás, e nenhum se
// resolve editando número.
//
// ⚠️ POR ISSO É DESFAZER, E NÃO EDITAR. Ajustar quantidade horas depois é
// CONFERÊNCIA, e conferência é do gerente — que já tem `apontarProducaoAction`
// sem teto no detalhe da OP. Um segundo fluxo numérico na tela do operador
// devolveria a ambiguidade que a Fase 3 tirou: "registrar" e "terminar"
// voltariam a ser duas coisas na cabeça dele, com uma delas chamada
// "corrigir".
//
// ─────────────────────────────────────────────────────────────────────────
// DUAS GUARDAS DE ESTADO REAL, E NENHUMA DE RELÓGIO
// ─────────────────────────────────────────────────────────────────────────
//
//   1. A OP ainda tem que estar em `pronto_envio`. Se o gerente já moveu,
//      não há mais volta pelo tablet — quem está adiante na esteira decide.
//   2. A máquina tem que estar LIVRE. Se alguém já iniciou outra OP na
//      TC-02, o mundo físico andou: tem peça na máquina agora.
//
// ⚠️ E NÃO HÁ JANELA DE TEMPO, de propósito. Um "só nos primeiros 15
// minutos" seria um terceiro guarda arbitrário, que recusa sem conseguir
// explicar por quê. As duas condições acima SÃO o mundo real, e toda recusa
// delas tem uma frase que o operador entende e pode agir sobre.
//
// ⚠️ O APONTAMENTO É APAGADO, e isso é decisão, não descuido. Manter o
// número errado inflaria a produção do dia — que é justamente o dado que
// alguém vai olhar. O RASTRO FICA NO `eventos_kanban`, com quem desfez,
// quando e qual era o número: o histórico não mente, só o total deixa de
// contar o que não foi produzido. (`apontamentos_producao` não é imobilizado
// — quem tem esse desenho é `movimentacoes_fio`; este aqui nasceu com
// `updatedAt`.)

export async function desfazerConclusaoAction(
  ordemId: string,
): Promise<ActionResult> {
  const user = await requireAuth()
  // Tablet travado não grava — ver src/lib/auth/inatividade.ts.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado
  if (!uuidRe.test(ordemId)) return { success: false, error: 'ID inválido' }

  if (!podeEscrever(await nivelDaAreaPara(user.role, 'kanban'))) {
    return { success: false, error: 'Sem permissão pra desfazer' }
  }

  const [op] = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      status: ordensProducao.status,
      maquinaId: ordensProducao.maquinaId,
    })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, ordemId), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!op) return { success: false, error: 'OP não encontrada' }

  // As frases de recusa foram escritas pro tablet ("fale com o gerente"). O
  // gerente chega aqui pelo "Desfazer" do board, e mandar ele falar com ele
  // mesmo seria só esquisito.
  const operador = user.role === 'operador'

  if (op.status !== 'pronto_envio') {
    return {
      success: false,
      error: operador
        ? `O gerente já moveu essa OP (${STATUS_LABEL_CURTO[op.status]}). Fale com ele.`
        : `Essa OP já saiu de Produção concluída (${STATUS_LABEL_CURTO[op.status]})`,
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PRA ONDE ELA VOLTA: DE ONDE ELA VEIO
  // ─────────────────────────────────────────────────────────────────────
  //
  // O evento da conclusão guarda a origem em `status_anterior`. Veio de
  // `em_producao` — o caso do tablet — e volta pra MESMA máquina, que tem que
  // estar livre. Veio da fila — a conclusão do gerente sem máquina — e volta
  // pra coluna de origem, sem máquina, por um ramo próprio.
  //
  // Sem evento (OP legada) ou sem origem, vale o caminho de sempre: a
  // máquina.
  const origem = await conclusaoMaisRecente(ordemId)
  const voltaPraMaquina =
    origem === null ||
    origem.de === null ||
    origem.de === 'em_producao'
  const destino = voltaPraMaquina ? 'em_producao' : origem.de!

  if (voltaPraMaquina) {
    if (!op.maquinaId) {
      return { success: false, error: 'Essa OP não tem máquina pra voltar' }
    }

    if (operador) {
      const permissao = await operadorPodeAgirNaOrdem(user.id, op.maquinaId)
      if (!permissao.pode) return { success: false, error: permissao.erro }
    }

    // A MÁQUINA TEM QUE ESTAR LIVRE. O índice único pegaria isso no UPDATE,
    // mas com um 23505 traduzido genérico; aqui dá pra dizer QUAL OP ocupou.
    const [ocupada] = await db
      .select({ numero: ordensProducao.numero, codigo: maquinas.codigo })
      .from(ordensProducao)
      .innerJoin(maquinas, eq(maquinas.id, ordensProducao.maquinaId))
      .where(
        and(
          eq(ordensProducao.maquinaId, op.maquinaId),
          eq(ordensProducao.status, 'em_producao'),
          isNull(ordensProducao.deletedAt),
        ),
      )
      .limit(1)
    if (ocupada) {
      return {
        success: false,
        error: operador
          ? `A máquina ${ocupada.codigo} já está com a OP ${ocupada.numero}. Fale com o gerente.`
          : `A máquina ${ocupada.codigo} já está com a OP ${ocupada.numero}`,
      }
    }
  } else if (!isManagerRole(user.role)) {
    // Só o gerente conclui de fora da máquina (`podeConcluirProducao`), então
    // só ele desfaz esse ramo.
    return {
      success: false,
      error: 'Essa conclusão foi feita pelo gerente. Fale com ele.',
    }
  }

  try {
    let desfeito = 0
    await db.transaction(async (tx) => {
      // Mesmo UPDATE condicional das outras: se alguém mexeu entre o SELECT
      // e agora, zero linhas e nada acontece.
      const gravadas = await tx
        .update(ordensProducao)
        .set({
          status: destino,
          // O ramo da fila volta sem máquina — ela já saiu sem, e a coluna de
          // origem não é lugar de OP presa a tear.
          ...(voltaPraMaquina ? {} : { maquinaId: null }),
        })
        .where(
          and(
            eq(ordensProducao.id, ordemId),
            isNull(ordensProducao.deletedAt),
            eq(ordensProducao.status, 'pronto_envio'),
          ),
        )
        .returning({ id: ordensProducao.id })
      if (gravadas.length === 0) throw new ConflitoDeOrdem()

      // QUAIS APONTAMENTOS SÃO DA CONCLUSÃO: os criados de lá pra cá. Achar
      // pelo evento é preciso; "o último apontamento" seria um chute que
      // erraria se o gerente tivesse lançado algo depois.
      //
      // Relido DENTRO da transação e conferido com o de fora: se outra
      // conclusão entrou no meio, a origem que decidiu o destino já não vale.
      const [conclusao] = await tx
        .select({ em: eventosKanban.createdAt })
        .from(eventosKanban)
        .where(
          and(
            eq(eventosKanban.ordemId, ordemId),
            eq(eventosKanban.statusNovo, 'pronto_envio'),
          ),
        )
        .orderBy(desc(eventosKanban.createdAt))
        .limit(1)
      if (
        origem !== null &&
        (!conclusao || conclusao.em.getTime() !== origem.em.getTime())
      ) {
        throw new ConflitoDeOrdem()
      }

      if (conclusao) {
        const apagados = await tx
          .delete(apontamentosProducao)
          .where(
            and(
              eq(apontamentosProducao.ordemId, ordemId),
              gte(apontamentosProducao.createdAt, conclusao.em),
            ),
          )
          .returning({ q: apontamentosProducao.quantidadeProduzida })
        desfeito = apagados.reduce((soma, a) => soma + a.q, 0)
      }

      await tx.insert(eventosKanban).values({
        ordemId,
        statusAnterior: 'pronto_envio',
        statusNovo: destino,
        usuarioId: user.id,
        observacao: voltaPraMaquina
          ? `Conclusão desfeita — o registro de ${desfeito} peças foi cancelado`
          : `Conclusão desfeita — voltou pra ${STATUS_LABEL_CURTO[destino]} sem máquina; o registro de ${desfeito} peças foi cancelado`,
      })
    })

    revalidatePath('/producao')
    revalidatePath('/dashboard')
    revalidatePath(`/ordens/${ordemId}`)
    return {
      success: true,
      message: voltaPraMaquina
        ? `OP ${op.numero} voltou pra máquina`
        : `OP ${op.numero} voltou pra ${STATUS_LABEL_CURTO[destino]}`,
    }
  } catch (erro) {
    if (erro instanceof ConflitoDeOrdem) {
      return {
        success: false,
        error: 'Alguém mexeu nessa OP agora mesmo. Atualize a tela.',
      }
    }
    if (ehConflitoDeMaquina(erro)) {
      return {
        success: false,
        error: operador
          ? 'A máquina foi ocupada agora mesmo. Fale com o gerente.'
          : 'A máquina foi ocupada agora mesmo',
      }
    }
    throw erro
  }
}

// A conclusão mais recente da OP: quando foi (pra achar os apontamentos dela)
// e de onde a OP veio (pra saber pra onde devolver).
async function conclusaoMaisRecente(
  ordemId: string,
): Promise<{ em: Date; de: (typeof statusValues)[number] | null } | null> {
  const [ev] = await db
    .select({ em: eventosKanban.createdAt, de: eventosKanban.statusAnterior })
    .from(eventosKanban)
    .where(
      and(
        eq(eventosKanban.ordemId, ordemId),
        eq(eventosKanban.statusNovo, 'pronto_envio'),
      ),
    )
    .orderBy(desc(eventosKanban.createdAt))
    .limit(1)
  return ev ?? null
}

// A quantidade recusada pelo teto. Classe própria pra desfazer a transação
// levando a frase de `erroDeQuantidade` junto — ela explica o teto com os
// números daquela OP, e um erro genérico perderia isso.
class QuantidadeRecusada extends Error {}

// A RESPOSTA PRA "CONCLUIR" NUMA OP QUE NÃO ESTÁ EM PONTO DE CONCLUIR.
//
// Dois casos são SUCESSO de propósito: já concluída e já com baixa são o
// reenvio depois de queda de conexão, e um "falhou" ali seria mentira sobre
// algo que deu certo. Cancelada e fora de produção são recusa de verdade.
function concluidaAntes(status: (typeof statusValues)[number]): ActionResult {
  if (status === 'pronto_envio') {
    return { success: true, message: 'Essa OP já estava com a produção concluída' }
  }
  if (status === 'enviado') {
    return { success: true, message: 'Essa OP já tem baixa' }
  }
  if (status === 'cancelado') {
    return { success: false, error: 'Essa OP foi cancelada' }
  }
  return {
    success: false,
    error: `Essa OP não está em produção (${STATUS_LABEL_CURTO[status]})`,
  }
}

// -----------------------------------------------------------------
// CANCELAR — a fábrica desistiu da OP
// -----------------------------------------------------------------
//
// Cancelar e excluir são coisas diferentes (topo de transicoes-da-op.ts):
// cancelada continua VISÍVEL em Canceladas, porque é informação sobre a
// fábrica. A regra do que pode vive em `erroDoCancelamento`, a mesma com que
// o sheet decide mostrar o botão e o Status manual decide oferecer a opção.
//
// Se estava em produção, a MÁQUINA FICA LIVRE sem nada a mais: o índice único
// `ordens_producao_maquina_em_producao_uidx` só cobre `em_producao`. O
// `maquina_id` fica na OP como histórico de onde ela estava.
//
// Escrita em "ordens", e não no kanban: cancelar é decisão sobre a OP, e é
// da área que a planeja.
export async function cancelarOrdemAction(id: string): Promise<ActionResult> {
  const user = await requireAreaEscrita('ordens')
  if (!uuidRegex.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await db
    .select({ id: ordensProducao.id, status: ordensProducao.status })
    .from(ordensProducao)
    .where(and(eq(ordensProducao.id, id), isNull(ordensProducao.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'OP não encontrada' }

  const erro = erroDoCancelamento(atual.status)
  if (erro) return { success: false, error: erro }

  const gravadas = await db.transaction(async (tx) => {
    // Condicional no status lido: se alguém deu baixa no meio, nada muda.
    const linhas = await tx
      .update(ordensProducao)
      .set({ status: 'cancelado' })
      .where(
        and(
          eq(ordensProducao.id, id),
          isNull(ordensProducao.deletedAt),
          eq(ordensProducao.status, atual.status),
        ),
      )
      .returning({ id: ordensProducao.id })
    if (linhas.length === 0) return 0

    await tx.insert(eventosKanban).values({
      ordemId: id,
      statusAnterior: atual.status,
      statusNovo: 'cancelado',
      usuarioId: user.id,
      observacao: 'OP cancelada',
    })
    return linhas.length
  })
  if (gravadas === 0) {
    return { success: false, error: 'Alguém mexeu nessa OP agora mesmo. Atualize a tela.' }
  }

  revalidatePath('/ordens')
  revalidatePath(`/ordens/${id}`)
  revalidatePath('/producao')
  revalidatePath('/fabrica')
  return { success: true, message: 'OP cancelada' }
}

// -----------------------------------------------------------------
// EXCLUIR — a OP foi um engano de cadastro
// -----------------------------------------------------------------
//
// ⚠️ GRAVA SÓ `deletedAt`, SEM MEXER NO STATUS. Antes gravava `cancelado`
// junto, e restaurar da lixeira devolvia como cancelada uma OP que nunca foi
// cancelada. Agora a lixeira devolve exatamente o que estava.
//
// Só o engano se exclui: OP que nunca entrou em produção e não tem
// apontamento (`erroDaExclusao`). O resto se cancela.
//
// O RASTRO FICA NO `eventos_kanban`, num evento sem transição ("OP excluída"):
// sem isto, quem excluiu e quando não estaria escrito em lugar nenhum. O
// relógio do aging ignora evento sem transição (producao/actions.ts).

// Ler o que a regra precisa de várias OPs de uma vez — o lote e a unitária
// usam a mesma consulta, pra decidir igual.
async function situacaoParaExcluir(ids: string[]) {
  return db
    .select({
      id: ordensProducao.id,
      status: ordensProducao.status,
      dataRealInicio: ordensProducao.dataRealInicio,
      temApontamento: sql<boolean>`EXISTS (
        SELECT 1 FROM ${apontamentosProducao}
        WHERE ${apontamentosProducao.ordemId} = "ordens_producao"."id"
      )`,
    })
    .from(ordensProducao)
    .where(and(inArray(ordensProducao.id, ids), isNull(ordensProducao.deletedAt)))
}

export async function excluirOrdemAction(id: string): Promise<ActionResult> {
  const user = await requireAreaEscrita('ordens')
  if (!uuidRegex.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await situacaoParaExcluir([id])
  if (!atual) return { success: false, error: 'OP não encontrada' }

  const erro = erroDaExclusao(atual)
  if (erro) return { success: false, error: erro }

  await db.transaction(async (tx) => {
    await tx
      .update(ordensProducao)
      .set({ deletedAt: new Date() })
      .where(eq(ordensProducao.id, id))
    await tx.insert(eventosKanban).values({
      ordemId: id,
      statusAnterior: atual.status,
      statusNovo: atual.status,
      usuarioId: user.id,
      observacao: 'OP excluída',
    })
  })

  revalidatePath('/ordens')
  revalidatePath('/producao')
  return { success: true, message: 'OP excluída' }
}

// -----------------------------------------------------------------
// Excluir múltiplas OPs (bulk delete)
// -----------------------------------------------------------------

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function excluirMultiplasOrdensAction(
  ids: string[],
): Promise<ActionResult<{ excluidas: number; recusadas: number }>> {
  const user = await requireAreaEscrita('ordens')

  if (!Array.isArray(ids) || ids.length === 0) {
    return { success: false, error: 'Selecione ao menos uma OP' }
  }
  const idsValidos = ids.filter((id) => uuidRegex.test(id))
  if (idsValidos.length === 0) {
    return { success: false, error: 'Nenhum ID válido na seleção' }
  }

  const ops = await situacaoParaExcluir(idsValidos)
  if (ops.length === 0) {
    return { success: false, error: 'Nenhuma OP encontrada' }
  }

  // A MESMA REGRA DA UNITÁRIA, OP por OP. As que podem são excluídas; as que
  // não podem ficam, e a resposta diz quantas e por quê — agrupado pela
  // frase da regra, pra "2 já entraram em produção" sair numa linha só.
  const podem = ops.filter((o) => erroDaExclusao(o) === null)
  const motivos = new Map<string, number>()
  for (const o of ops) {
    const erro = erroDaExclusao(o)
    if (erro) motivos.set(erro, (motivos.get(erro) ?? 0) + 1)
  }

  if (podem.length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .update(ordensProducao)
        .set({ deletedAt: new Date() })
        .where(inArray(ordensProducao.id, podem.map((o) => o.id)))
      await tx.insert(eventosKanban).values(
        podem.map((o) => ({
          ordemId: o.id,
          statusAnterior: o.status,
          statusNovo: o.status,
          usuarioId: user.id,
          observacao: 'OP excluída em lote',
        })),
      )
    })
    revalidatePath('/ordens')
    revalidatePath('/producao')
  }

  const recusadas = ops.length - podem.length
  const partes: string[] = []
  if (podem.length > 0) {
    partes.push(podem.length === 1 ? '1 OP excluída' : `${podem.length} OPs excluídas`)
  }
  for (const [motivo, n] of motivos) {
    partes.push(`${n} não: ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}`)
  }

  if (podem.length === 0) {
    return { success: false, error: partes.join(' · ') }
  }
  return {
    success: true,
    data: { excluidas: podem.length, recusadas },
    message: partes.join(' · '),
  }
}
