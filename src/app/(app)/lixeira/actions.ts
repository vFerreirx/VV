'use server'

import { and, desc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  apontamentosProducao,
  cores,
  coresFornecedorFio,
  deParaFullComponentes,
  estacoes,
  kitItens,
  kits,
  maquinas,
  modelos,
  movimentacoesEstoque,
  ordensProducao,
  produtos,
  remessasFull,
  tamanhos,
  tarefas,
  variacoesProduto,
} from '@/lib/db/schema'
import { CANAL_LABEL_CURTO } from '@/lib/validators/ordens'

// Lixeira: tudo no sistema é soft-delete (deleted_at). Aqui o admin vê o
// que foi excluído, restaura, ou apaga DE VEZ (DELETE mesmo, sem volta).

export type ActionResult = { success: true; message?: string } | { success: false; error: string }

export type TipoLixeira =
  | 'produto'
  | 'op'
  | 'kit'
  | 'cor'
  | 'modelo'
  | 'tamanho'
  | 'maquina'
  | 'estacao'
  | 'remessa'
  | 'tarefa'

export type ItemLixeira = {
  tipo: TipoLixeira
  id: string
  titulo: string
  subtitulo: string
  excluidoEm: Date
}

const LIMITE_POR_TIPO = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tabela de cada tipo. Todas têm `id` e `deleted_at` — é o que a lixeira
// precisa pra listar, restaurar e apagar.
const TABELA = {
  produto: produtos,
  op: ordensProducao,
  kit: kits,
  cor: cores,
  modelo: modelos,
  tamanho: tamanhos,
  maquina: maquinas,
  estacao: estacoes,
  remessa: remessasFull,
  tarefa: tarefas,
} as const

// Executa as consultas UMA DE CADA VEZ, e não com Promise.all.
//
// O pool do postgres-js tem 10 conexões (src/lib/db/index.ts). Disparar as
// dez consultas desta tela de uma vez toma o pool inteiro; com a consulta
// do contador e os prefetches do Next disputando ao mesmo tempo, a página
// travava esperando conexão — comprovado: com `max: 40` o travamento some,
// e ele existia antes desta tela ganhar o décimo tipo.
//
// São dez consultas minúsculas (50 linhas cada, por índice): em série
// custam alguns milissegundos e a tela deixa de depender do tamanho do
// pool.
// Parâmetro REST (e não um array): é o que faz o TypeScript inferir uma
// tupla e manter o tipo de cada consulta separado na desestruturação.
async function emSerie<T extends readonly (() => PromiseLike<unknown>)[]>(
  ...consultas: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const saida: unknown[] = []
  for (const consulta of consultas) saida.push(await consulta())
  return saida as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }
}

export async function listarExcluidos(): Promise<ItemLixeira[]> {
  await requireRole(['admin'])

  const [
    prods,
    ops,
    kitsRows,
    coresRows,
    modelosRows,
    tamanhosRows,
    maqs,
    ests,
    remessas,
    tarefasRows,
  ] = await emSerie(
    () =>
      db
        .select({ id: produtos.id, nome: produtos.nome, sku: produtos.sku, em: produtos.deletedAt })
        .from(produtos)
        .where(isNotNull(produtos.deletedAt))
        .orderBy(desc(produtos.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({
          id: ordensProducao.id,
          numero: ordensProducao.numero,
          em: ordensProducao.deletedAt,
          produtoNome: produtos.nome,
        })
        .from(ordensProducao)
        .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
        .where(isNotNull(ordensProducao.deletedAt))
        .orderBy(desc(ordensProducao.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({ id: kits.id, nome: kits.nome, sku: kits.sku, em: kits.deletedAt })
        .from(kits)
        .where(isNotNull(kits.deletedAt))
        .orderBy(desc(kits.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({ id: cores.id, nome: cores.nome, em: cores.deletedAt })
        .from(cores)
        .where(isNotNull(cores.deletedAt))
        .orderBy(desc(cores.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({ id: modelos.id, nome: modelos.nome, em: modelos.deletedAt })
        .from(modelos)
        .where(isNotNull(modelos.deletedAt))
        .orderBy(desc(modelos.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({ id: tamanhos.id, nome: tamanhos.nome, em: tamanhos.deletedAt })
        .from(tamanhos)
        .where(isNotNull(tamanhos.deletedAt))
        .orderBy(desc(tamanhos.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({
          id: maquinas.id,
          nome: maquinas.nome,
          codigo: maquinas.codigo,
          em: maquinas.deletedAt,
        })
        .from(maquinas)
        .where(isNotNull(maquinas.deletedAt))
        .orderBy(desc(maquinas.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({ id: estacoes.id, nome: estacoes.nome, em: estacoes.deletedAt })
        .from(estacoes)
        .where(isNotNull(estacoes.deletedAt))
        .orderBy(desc(estacoes.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({
          id: remessasFull.id,
          canal: remessasFull.canal,
          dataEnvio: remessasFull.dataEnvio,
          envioId: remessasFull.envioId,
          em: remessasFull.deletedAt,
        })
        .from(remessasFull)
        .where(isNotNull(remessasFull.deletedAt))
        .orderBy(desc(remessasFull.deletedAt))
        .limit(LIMITE_POR_TIPO),
    () =>
      db
        .select({
          id: tarefas.id,
          titulo: tarefas.titulo,
          concluidaEm: tarefas.concluidaEm,
          em: tarefas.deletedAt,
        })
        .from(tarefas)
        .where(isNotNull(tarefas.deletedAt))
        .orderBy(desc(tarefas.deletedAt))
        .limit(LIMITE_POR_TIPO),
  )

  const itens: ItemLixeira[] = [
    ...prods.map(
      (p): ItemLixeira => ({
        tipo: 'produto',
        id: p.id,
        titulo: p.nome,
        subtitulo: p.sku,
        excluidoEm: p.em!,
      }),
    ),
    ...ops.map(
      (o): ItemLixeira => ({
        tipo: 'op',
        id: o.id,
        titulo: `${o.numero} — ${o.produtoNome}`,
        subtitulo: 'volta como cancelada',
        excluidoEm: o.em!,
      }),
    ),
    ...kitsRows.map(
      (k): ItemLixeira => ({
        tipo: 'kit',
        id: k.id,
        titulo: k.nome,
        subtitulo: k.sku,
        excluidoEm: k.em!,
      }),
    ),
    ...coresRows.map(
      (c): ItemLixeira => ({
        tipo: 'cor',
        id: c.id,
        titulo: c.nome,
        subtitulo: 'Cor',
        excluidoEm: c.em!,
      }),
    ),
    ...modelosRows.map(
      (m): ItemLixeira => ({
        tipo: 'modelo',
        id: m.id,
        titulo: m.nome,
        subtitulo: 'Modelo',
        excluidoEm: m.em!,
      }),
    ),
    ...tamanhosRows.map(
      (t): ItemLixeira => ({
        tipo: 'tamanho',
        id: t.id,
        titulo: t.nome,
        subtitulo: 'Tamanho',
        excluidoEm: t.em!,
      }),
    ),
    ...maqs.map(
      (m): ItemLixeira => ({
        tipo: 'maquina',
        id: m.id,
        titulo: m.nome,
        subtitulo: m.codigo,
        excluidoEm: m.em!,
      }),
    ),
    ...ests.map(
      (e): ItemLixeira => ({
        tipo: 'estacao',
        id: e.id,
        titulo: e.nome,
        subtitulo: 'máquinas precisam ser revinculadas',
        excluidoEm: e.em!,
      }),
    ),
    ...remessas.map(
      (r): ItemLixeira => ({
        tipo: 'remessa',
        id: r.id,
        titulo: `${CANAL_LABEL_CURTO[r.canal]} · envio de ${r.dataEnvio.split('-').reverse().join('/')}`,
        subtitulo: r.envioId ? `envio ${r.envioId}` : 'sem identificador de envio',
        excluidoEm: r.em!,
      }),
    ),
    ...tarefasRows.map(
      (t): ItemLixeira => ({
        tipo: 'tarefa',
        id: t.id,
        titulo: t.titulo,
        // Restaurar devolve a tarefa no estado em que ela foi excluída, então
        // vale dizer em qual estado ela vai voltar.
        subtitulo: t.concluidaEm ? 'volta como concluída' : 'volta como pendente',
        excluidoEm: t.em!,
      }),
    ),
  ]

  // Mais recentes primeiro, tipos misturados.
  itens.sort((a, b) => b.excluidoEm.getTime() - a.excluidoEm.getTime())
  return itens
}

// Total REAL da lixeira. A listagem mostra no máximo 50 por tipo, então o
// número de linhas na tela não serve pra dizer quanto o "esvaziar" vai
// mexer — e prometer um número errado num diálogo sem desfazer é o pior
// lugar pra economizar uma consulta.
export async function contarExcluidos(): Promise<number> {
  await requireRole(['admin'])

  const partes = Object.values(TABELA).map(
    (tabela) => sql`(SELECT count(*) FROM ${tabela} WHERE ${tabela.deletedAt} IS NOT NULL)`,
  )
  const [linha] = await db
    .select({ total: sql<number>`(${sql.join(partes, sql` + `)})::int` })
    .from(sql`(SELECT 1) AS _`)
  return linha?.total ?? 0
}

export async function restaurarAction(tipo: TipoLixeira, id: string): Promise<ActionResult> {
  await requireRole(['admin'])

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  try {
    switch (tipo) {
      case 'produto':
        await db.transaction(async (tx) => {
          await tx.update(produtos).set({ deletedAt: null, ativo: true }).where(eq(produtos.id, id))
          // Restaura as variações junto (o soft delete do produto derruba
          // todas; restaurar tudo é o comportamento menos surpreendente).
          await tx
            .update(variacoesProduto)
            .set({ deletedAt: null })
            .where(eq(variacoesProduto.produtoId, id))
        })
        break
      case 'op':
        // Volta com o status que tinha ao ser excluída (cancelado, na
        // prática) — o usuário reativa pelo fluxo normal.
        await db.update(ordensProducao).set({ deletedAt: null }).where(eq(ordensProducao.id, id))
        break
      case 'kit':
        await db.update(kits).set({ deletedAt: null, ativo: true }).where(eq(kits.id, id))
        break
      case 'cor':
        await db.update(cores).set({ deletedAt: null, ativo: true }).where(eq(cores.id, id))
        break
      case 'modelo':
        await db.update(modelos).set({ deletedAt: null, ativo: true }).where(eq(modelos.id, id))
        break
      case 'tamanho':
        await db.update(tamanhos).set({ deletedAt: null, ativo: true }).where(eq(tamanhos.id, id))
        break
      case 'maquina':
        await db.update(maquinas).set({ deletedAt: null }).where(eq(maquinas.id, id))
        break
      case 'estacao':
        await db.update(estacoes).set({ deletedAt: null, ativo: true }).where(eq(estacoes.id, id))
        break
      case 'remessa':
        // As OPs da remessa NÃO voltam junto: elas têm lixeira própria e
        // cada uma pode ter sido excluída por um motivo diferente.
        await db.update(remessasFull).set({ deletedAt: null }).where(eq(remessasFull.id, id))
        break
      case 'tarefa':
        // Volta como estava: se foi excluída já concluída, volta concluída.
        await db.update(tarefas).set({ deletedAt: null }).where(eq(tarefas.id, id))
        break
      default:
        return { success: false, error: 'Tipo desconhecido' }
    }
  } catch (e) {
    // Índices únicos parciais (SKU/nome/código entre não-excluídos): se o
    // identificador foi reutilizado, a restauração conflita.
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return {
        success: false,
        error: 'Não dá pra restaurar: o SKU/nome/código já está em uso por outro item ativo.',
      }
    }
    throw e
  }

  revalidatePath('/lixeira')
  if (tipo === 'remessa') revalidatePath('/remessas')
  if (tipo === 'tarefa') {
    revalidatePath('/tarefas')
    revalidatePath('/dashboard')
  }
  return { success: true, message: 'Item restaurado' }
}

// -----------------------------------------------------------------
// Exclusão DEFINITIVA
// -----------------------------------------------------------------

// Uma dependência que impede o DELETE.
//
// As contagens NÃO filtram deleted_at DE PROPÓSITO: a chave estrangeira do
// Postgres também não filtra. Uma OP na lixeira continua segurando o produto
// dela — se contássemos só as ativas, a checagem diria "livre" e o DELETE
// estouraria com erro de FK na cara do usuário.
type Checagem = {
  // Texto sem número, usado pra agrupar os pulados do "esvaziar".
  curto: string
  // Texto com número, mostrado quando é UM item só.
  frase: (n: number) => string
  contagem: SQL<number>
}

function conta(query: SQL): SQL<number> {
  return sql<number>`(${query})::int`
}

const CHECAGENS: Record<TipoLixeira, Checagem[]> = {
  produto: [
    {
      curto: 'usado por OPs',
      frase: (n) => `é usado por ${n} OP${n > 1 ? 's' : ''} (contando as que estão na lixeira)`,
      contagem: conta(
        sql`SELECT count(*) FROM ${ordensProducao} o WHERE o.produto_id = ${produtos.id}`,
      ),
    },
    {
      curto: 'tem movimentação de estoque',
      frase: (n) => `tem ${n} movimentação${n > 1 ? 'ões' : ''} de estoque`,
      contagem: conta(
        sql`SELECT count(*) FROM ${movimentacoesEstoque} m WHERE m.produto_id = ${produtos.id}`,
      ),
    },
    {
      curto: 'compõe kits',
      frase: (n) => `compõe ${n} kit${n > 1 ? 's' : ''}`,
      contagem: conta(sql`SELECT count(*) FROM ${kitItens} k WHERE k.produto_id = ${produtos.id}`),
    },
    {
      // As variações somem por cascata junto com o produto, mas o de-para do
      // Full aponta pra VARIAÇÃO com FK que bloqueia — sem esta checagem o
      // DELETE falharia direto no banco.
      curto: 'variações usadas no de-para do Full',
      frase: (n) =>
        `tem ${n} variação${n > 1 ? 'ões' : ''} usada${n > 1 ? 's' : ''} no de-para do Full`,
      contagem: conta(sql`SELECT count(*) FROM ${deParaFullComponentes} c
        JOIN ${variacoesProduto} v ON v.id = c.variacao_id
        WHERE v.produto_id = ${produtos.id}`),
    },
  ],
  op: [
    {
      curto: 'tem apontamento de produção',
      frase: (n) =>
        `tem ${n} apontamento${n > 1 ? 's' : ''} de produção — o registro do que foi produzido seria perdido`,
      contagem: conta(
        sql`SELECT count(*) FROM ${apontamentosProducao} a WHERE a.ordem_id = ${ordensProducao.id}`,
      ),
    },
    {
      // `movimentacoes_estoque.referencia_id` aponta pra OP mas NÃO é chave
      // estrangeira (é uuid solto com referencia_tipo='ordem'). O banco não
      // reclamaria; sobraria uma entrada de estoque apontando pro nada.
      // Bloqueamos em vez de limpar a referência: a movimentação é um fato
      // de estoque, e é a OP que explica de onde ele veio.
      curto: 'deu entrada no estoque',
      frase: (n) =>
        `gerou ${n} entrada${n > 1 ? 's' : ''} no estoque — apagar deixaria a movimentação sem origem`,
      contagem: conta(sql`SELECT count(*) FROM ${movimentacoesEstoque} m
        WHERE m.referencia_tipo = 'ordem' AND m.referencia_id = ${ordensProducao.id}`),
    },
  ],
  // kit_itens some por cascata; de_para_full.kit_id e orcamento_itens.kit_id
  // são SET NULL (o de-para guarda os componentes, não depende do kit).
  kit: [],
  cor: [
    {
      curto: 'usada no de-para de fios',
      frase: (n) => `está ligada a ${n} cor${n > 1 ? 'es' : ''} de fornecedor de fio`,
      contagem: conta(
        sql`SELECT count(*) FROM ${coresFornecedorFio} f WHERE f.cor_id = ${cores.id}`,
      ),
    },
  ],
  // Ninguém referencia modelo/tamanho por chave — a variação guarda o TEXTO.
  modelo: [],
  tamanho: [],
  maquina: [
    {
      curto: 'usada por OPs',
      frase: (n) => `está em ${n} OP${n > 1 ? 's' : ''} (contando as que estão na lixeira)`,
      contagem: conta(
        sql`SELECT count(*) FROM ${ordensProducao} o WHERE o.maquina_id = ${maquinas.id}`,
      ),
    },
    {
      curto: 'tem apontamento de produção',
      frase: (n) => `tem ${n} apontamento${n > 1 ? 's' : ''} de produção`,
      contagem: conta(
        sql`SELECT count(*) FROM ${apontamentosProducao} a WHERE a.maquina_id = ${maquinas.id}`,
      ),
    },
  ],
  // maquinas.estacao_id tem FK com SET NULL: as máquinas da estação ficam
  // sem estação sozinhas, sem bloquear. O aviso disso está na tela.
  estacao: [],
  remessa: [
    {
      curto: 'tem OPs vinculadas',
      frase: (n) =>
        `tem ${n} OP${n > 1 ? 's' : ''} vinculada${n > 1 ? 's' : ''} (contando as que estão na lixeira) — apague as OPs primeiro`,
      contagem: conta(
        sql`SELECT count(*) FROM ${ordensProducao} o WHERE o.remessa_full_id = ${remessasFull.id}`,
      ),
    },
  ],
  // Ninguém referencia tarefa: ela é folha do grafo. Apagar de vez só
  // apaga ela mesma.
  tarefa: [],
}

type Bloqueio = { curto: string; detalhado: string }

// Pra cada id BLOQUEADO devolve o motivo. Id que não está no mapa pode ser
// apagado. `ids = null` verifica tudo que está na lixeira daquele tipo.
async function bloqueiosDe(
  tipo: TipoLixeira,
  ids: string[] | null,
): Promise<Map<string, Bloqueio>> {
  const checagens = CHECAGENS[tipo]
  const bloqueios = new Map<string, Bloqueio>()
  if (checagens.length === 0) return bloqueios

  const tabela = TABELA[tipo]
  const selecao: Record<string, SQL<number>> = {}
  checagens.forEach((c, i) => {
    selecao[`c${i}`] = c.contagem
  })

  const rows = await db
    .select({ id: tabela.id, ...selecao })
    .from(tabela)
    .where(
      ids === null
        ? isNotNull(tabela.deletedAt)
        : and(isNotNull(tabela.deletedAt), inArray(tabela.id, ids)),
    )

  for (const row of rows) {
    const motivos = checagens
      .map((c, i) => ({ c, n: Number(row[`c${i}` as keyof typeof row] ?? 0) }))
      .filter((m) => m.n > 0)
    if (motivos.length === 0) continue
    bloqueios.set(row.id, {
      curto: motivos.map((m) => m.c.curto).join(' e '),
      detalhado: motivos.map((m) => m.c.frase(m.n)).join('; '),
    })
  }
  return bloqueios
}

// DELETE de verdade. O `isNotNull(deletedAt)` é a trava que garante que só
// some o que já estava na lixeira — nunca um registro em uso.
async function apagar(tipo: TipoLixeira, ids: string[]): Promise<void> {
  const tabela = TABELA[tipo]
  await db.transaction(async (tx) => {
    await tx.delete(tabela).where(and(inArray(tabela.id, ids), isNotNull(tabela.deletedAt)))
  })
}

// Violação de chave estrangeira do Postgres. É a rede de segurança: se
// alguma dependência escapar das checagens acima, o usuário recebe uma
// recusa em vez de um erro 500 — e nada é apagado, porque está em transação.
function ehViolacaoDeVinculo(e: unknown): boolean {
  const código = (e as { code?: string } | null)?.code
  return código === '23503'
}

export async function excluirDefinitivamenteAction(
  tipo: TipoLixeira,
  id: string,
): Promise<ActionResult> {
  // SÓ ADMIN — nem gerente. Apagar de vez não tem desfazer.
  await requireRole(['admin'])

  if (!(tipo in TABELA)) return { success: false, error: 'Tipo desconhecido' }
  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const bloqueios = await bloqueiosDe(tipo, [id])
  const bloqueio = bloqueios.get(id)
  if (bloqueio) {
    return { success: false, error: `Não dá pra apagar: ${bloqueio.detalhado}.` }
  }

  try {
    await apagar(tipo, [id])
  } catch (e) {
    if (ehViolacaoDeVinculo(e)) {
      return {
        success: false,
        error: 'Não dá pra apagar: ainda existe outro registro no banco ligado a este item.',
      }
    }
    throw e
  }

  revalidatePath('/lixeira')
  if (tipo === 'remessa') revalidatePath('/remessas')
  if (tipo === 'tarefa') {
    revalidatePath('/tarefas')
    revalidatePath('/dashboard')
  }
  return { success: true, message: 'Apagado definitivamente' }
}

// -----------------------------------------------------------------
// Esvaziar
// -----------------------------------------------------------------

export type RelatorioEsvaziar = {
  apagados: number
  // Agrupado por (tipo, motivo): com centenas de itens na lixeira, uma lista
  // item a item seria ilegível — o que interessa é o que impede e quantos.
  pulados: { tipo: TipoLixeira; motivo: string; quantidade: number }[]
}

// Ordem de dependência: apagar OP antes libera o produto e a remessa dela;
// apagar kit antes libera o produto que ele compunha. Numa passada só, essa
// ordem é o que faz o "esvaziar" limpar o máximo possível.
const ORDEM_ESVAZIAR: TipoLixeira[] = [
  'op',
  'remessa',
  'kit',
  'produto',
  'maquina',
  'estacao',
  'cor',
  'modelo',
  'tamanho',
  // Folha do grafo: a posição não importa, vai no fim por convenção.
  'tarefa',
]

export async function esvaziarLixeiraAction(): Promise<
  { success: true; relatorio: RelatorioEsvaziar } | { success: false; error: string }
> {
  await requireRole(['admin'])

  let apagados = 0
  const pulados = new Map<string, { tipo: TipoLixeira; motivo: string; quantidade: number }>()

  function pular(tipo: TipoLixeira, motivo: string) {
    const chave = `${tipo}|${motivo}`
    const atual = pulados.get(chave)
    if (atual) atual.quantidade++
    else pulados.set(chave, { tipo, motivo, quantidade: 1 })
  }

  for (const tipo of ORDEM_ESVAZIAR) {
    const tabela = TABELA[tipo]
    const linhas = await db
      .select({ id: tabela.id })
      .from(tabela)
      .where(isNotNull(tabela.deletedAt))
    if (linhas.length === 0) continue

    const bloqueios = await bloqueiosDe(tipo, null)
    const livres: string[] = []
    for (const { id } of linhas) {
      const b = bloqueios.get(id)
      if (b) pular(tipo, b.curto)
      else livres.push(id)
    }
    if (livres.length === 0) continue

    // Em lote, porque são centenas de linhas e uma transação por item
    // significaria centenas de idas ao banco.
    try {
      await apagar(tipo, livres)
      apagados += livres.length
    } catch {
      // Algum vínculo que a checagem não previu derrubou o lote inteiro (e a
      // transação desfez tudo). Refaz um a um: assim um item problemático
      // não leva junto os que estavam bem.
      for (const id of livres) {
        try {
          await apagar(tipo, [id])
          apagados++
        } catch {
          pular(tipo, 'ainda está ligado a outro registro')
        }
      }
    }
  }

  revalidatePath('/lixeira')
  revalidatePath('/remessas')
  revalidatePath('/tarefas')
  revalidatePath('/dashboard')
  return {
    success: true,
    relatorio: { apagados, pulados: [...pulados.values()] },
  }
}
