'use server'

import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'

import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import {
  requireArea,
  requireAreaEscrita,
  requireAuth,
} from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  cores,
  ordensProducao,
  produtos,
  reposicoesEstoque,
  users,
  variacoesProduto,
} from '@/lib/db/schema'
import {
  ReposicaoIndisponivel,
  erroDaPecaDaOp,
  gravarOp,
} from '@/lib/db/criacao-da-op'
import {
  DIAS_DE_ATENDIDOS,
  ESTADOS_ATIVOS_DE_REPOSICAO,
  acaoDaReposicao,
  destinoDaMarcacao,
  faixaDeNumeros,
  ordenarFila,
  prioridadeDaSituacao,
  proximoEstadoDoParceiro,
  situacaoDepoisDaMarcacao,
  viraOp,
  type EstadoDeReposicao,
  type SituacaoDeReposicao,
} from '@/lib/producao/reposicao'
import {
  marcarReposicaoSchema,
  type MarcarReposicaoInput,
} from '@/lib/validators/reposicao'
import type { statusValues } from '@/lib/validators/ordens'

// A FILA DE REPOSIÇÃO — o que o /estoque é agora. A regra (estados, ordem da
// fila, descarte) mora em src/lib/producao/reposicao.ts; o porquê da troca do
// saldo pela fila está em src/lib/db/saldo-estoque.ts.
//
// ⚠️ O SALDO SAIU DAQUI. `listarEstoque`, `listarMovimentacoes` e
// `movimentarEstoqueAction` eram endpoints públicos ('use server') de uma tela
// que não existe mais — e o último gravava ajuste numa tabela que ninguém vê.
// A consulta do saldo ficou em src/lib/db/saldo-estoque.ts, sem endpoint.

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

const marcou = alias(users, 'marcou_reposicao')
const descartou = alias(users, 'descartou_reposicao')
const pediu = alias(users, 'pediu_reposicao')

export type ItemDeReposicao = {
  id: string
  produtoId: string
  produtoNome: string
  /** 'parceiro' = comprado pronto: "Pedir ao parceiro" no lugar de "Produzir". */
  produtoOrigem: string
  variacaoId: string
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
  corHex: string | null
  corHex2: string | null
  /** A variação saiu do catálogo depois da marcação: não dá pra produzir. */
  foraDoCatalogo: boolean
  situacao: SituacaoDeReposicao
  /** Quantas produzir (75). Null nos itens de antes da quantidade existir. */
  quantidade: number | null
  observacao: string | null
  marcadoPorNome: string | null
  marcadoEm: Date
  estado: EstadoDeReposicao
  opId: string | null
  opNumero: string | null
  opStatus: (typeof statusValues)[number] | null
  /** A quantidade da OP ligada — é o que a fila mostra em produção. */
  opQuantidade: number | null
  repostoEm: Date | null
  pedidoParceiroEm: Date | null
  pedidoParceiroPorNome: string | null
  descartadoEm: Date | null
  descartadoPorNome: string | null
  motivoDescarte: string | null
}

function consultaDeItens() {
  return db
    .select({
      id: reposicoesEstoque.id,
      produtoId: reposicoesEstoque.produtoId,
      produtoNome: produtos.nome,
      produtoOrigem: produtos.origem,
      produtoExcluido: produtos.deletedAt,
      produtoAtivo: produtos.ativo,
      variacaoId: reposicoesEstoque.variacaoId,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      variacaoExcluida: variacoesProduto.deletedAt,
      corHex: cores.codigoHex,
      corHex2: cores.codigoHex2,
      situacao: reposicoesEstoque.situacao,
      quantidade: reposicoesEstoque.quantidade,
      observacao: reposicoesEstoque.observacao,
      marcadoPorNome: marcou.nome,
      marcadoEm: reposicoesEstoque.marcadoEm,
      estado: reposicoesEstoque.estado,
      opId: ordensProducao.id,
      opNumero: ordensProducao.numero,
      opStatus: ordensProducao.status,
      opQuantidade: ordensProducao.quantidade,
      repostoEm: reposicoesEstoque.repostoEm,
      pedidoParceiroEm: reposicoesEstoque.pedidoParceiroEm,
      pedidoParceiroPorNome: pediu.nome,
      descartadoEm: reposicoesEstoque.descartadoEm,
      descartadoPorNome: descartou.nome,
      motivoDescarte: reposicoesEstoque.motivoDescarte,
    })
    .from(reposicoesEstoque)
    .innerJoin(produtos, eq(produtos.id, reposicoesEstoque.produtoId))
    .innerJoin(
      variacoesProduto,
      eq(variacoesProduto.id, reposicoesEstoque.variacaoId),
    )
    // A amostra: mesmo LEFT JOIN por nome da Nova OP e do tablet.
    .leftJoin(cores, eq(cores.nome, variacoesProduto.cor))
    .leftJoin(marcou, eq(marcou.id, reposicoesEstoque.marcadoPor))
    .leftJoin(descartou, eq(descartou.id, reposicoesEstoque.descartadoPor))
    .leftJoin(pediu, eq(pediu.id, reposicoesEstoque.pedidoParceiroPor))
    .leftJoin(ordensProducao, eq(ordensProducao.id, reposicoesEstoque.ordemId))
}

type LinhaDeItem = Awaited<ReturnType<typeof consultaDeItens>>[number]

function paraItem(r: LinhaDeItem): ItemDeReposicao {
  return {
    id: r.id,
    produtoId: r.produtoId,
    produtoNome: r.produtoNome,
    produtoOrigem: r.produtoOrigem,
    variacaoId: r.variacaoId,
    variacaoCor: r.variacaoCor ?? null,
    variacaoModelo: r.variacaoModelo ?? null,
    variacaoTamanho: r.variacaoTamanho ?? null,
    corHex: r.corHex ?? null,
    corHex2: r.corHex2 ?? null,
    foraDoCatalogo:
      r.variacaoExcluida !== null ||
      r.produtoExcluido !== null ||
      !r.produtoAtivo,
    situacao: r.situacao as SituacaoDeReposicao,
    quantidade: r.quantidade,
    observacao: r.observacao,
    marcadoPorNome: r.marcadoPorNome ?? null,
    marcadoEm: r.marcadoEm,
    estado: r.estado as EstadoDeReposicao,
    opId: r.opId ?? null,
    opNumero: r.opNumero ?? null,
    opStatus: r.opStatus ?? null,
    opQuantidade: r.opQuantidade ?? null,
    repostoEm: r.repostoEm,
    pedidoParceiroEm: r.pedidoParceiroEm,
    pedidoParceiroPorNome: r.pedidoParceiroPorNome ?? null,
    descartadoEm: r.descartadoEm,
    descartadoPorNome: r.descartadoPorNome ?? null,
    motivoDescarte: r.motivoDescarte,
  }
}

/**
 * A fila: aberto, em produção e pedido ao parceiro — "Acabou" primeiro e o
 * mais antigo antes. O pedido ao parceiro fica na fila como o em produção:
 * saiu do "em aberto", e a peça ainda não chegou.
 */
export async function listarFilaDeReposicao(): Promise<ItemDeReposicao[]> {
  await requireArea('estoque')
  const rows = await consultaDeItens().where(
    inArray(reposicoesEstoque.estado, [...ESTADOS_ATIVOS_DE_REPOSICAO]),
  )
  return ordenarFila(rows.map(paraItem))
}

/**
 * Repostos dos últimos 30 dias, o mais recente primeiro. Descartar apaga o
 * item, então os `descartado` só aparecem se existirem de antes dessa regra.
 */
export async function listarReposicoesAtendidas(): Promise<ItemDeReposicao[]> {
  await requireArea('estoque')
  const desde = new Date(Date.now() - DIAS_DE_ATENDIDOS * 24 * 60 * 60 * 1000)
  const quando = sql`coalesce(${reposicoesEstoque.repostoEm}, ${reposicoesEstoque.descartadoEm})`
  const rows = await consultaDeItens()
    .where(
      or(
        and(
          eq(reposicoesEstoque.estado, 'reposto'),
          gte(reposicoesEstoque.repostoEm, desde),
        ),
        and(
          eq(reposicoesEstoque.estado, 'descartado'),
          gte(reposicoesEstoque.descartadoEm, desde),
        ),
      ),
    )
    .orderBy(desc(quando))
  return rows.map(paraItem)
}

// -----------------------------------------------------------------
// Marcar peças acabando — com a quantidade, e as OPs no mesmo gesto
// -----------------------------------------------------------------
//
// Cada peça marcada leva a quantidade (Q200). Com `criarOps` — quem pode
// criar OP, o gerente —, cada peça que ainda não tem OP vira uma, NUMA
// TRANSAÇÃO SÓ com os itens (Q201): canal Estoque, a quantidade digitada, a
// prioridade pela situação (Q202), ligada ao item, que fica "Em produção".
// Tudo ou nada: se uma OP falha, nenhuma fica, e nenhum item muda.
//
// O que acontece com CADA peça é `destinoDaMarcacao` (reposicao.ts), a mesma
// regra que o diálogo usa pra contar o botão. A OP sai pelo mesmo núcleo da
// Nova OP (`gravarOp`, src/lib/db/criacao-da-op.ts) — um caminho só.

export type ResultadoDaMarcacao = {
  criados: number
  atualizados: number
  jaEmProducao: number
  jaPedidos: number
  /** Os números das OPs criadas agora. */
  ops: string[]
}

export async function marcarReposicaoAction(
  input: MarcarReposicaoInput,
): Promise<ActionResult<ResultadoDaMarcacao>> {
  const user = await requireAreaEscrita('estoque')

  const parsed = marcarReposicaoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data
  // Criar OP é decisão de quem decide o que se produz: escrita em Ordens,
  // como o "Produzir" e o "Descartar". A estoquista marca sem OP.
  if (data.criarOps) await requireAreaEscrita('ordens')

  // A VARIAÇÃO TEM QUE SER DO PRODUTO E ESTAR NO CATÁLOGO. A FK sozinha aceita
  // variação de outro produto — o mesmo cuidado de `criarOrdemAction`.
  const ids = data.marcacoes.map((m) => m.variacaoId)
  const validas = await db
    .select({ id: variacoesProduto.id, origem: produtos.origem })
    .from(variacoesProduto)
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(
      and(
        inArray(variacoesProduto.id, ids),
        eq(variacoesProduto.produtoId, data.produtoId),
        isNull(variacoesProduto.deletedAt),
        isNull(produtos.deletedAt),
        eq(produtos.ativo, true),
      ),
    )
  if (validas.length !== new Set(ids).size) {
    return {
      success: false,
      error: 'Alguma peça não está mais no catálogo. Atualize a tela.',
    }
  }
  const origem = validas[0]!.origem
  // A peça que vai virar OP passa pela MESMA conferência da Nova OP. Produto
  // de parceiro não passa: `destinoDaMarcacao` nunca o manda pra OP.
  if (data.criarOps && acaoDaReposicao(origem) === 'produzir') {
    const erroDaPeca = await erroDaPecaDaOp(data.produtoId, ids)
    if (erroDaPeca) return { success: false, error: erroDaPeca }
  }

  const resultado: ResultadoDaMarcacao = {
    criados: 0,
    atualizados: 0,
    jaEmProducao: 0,
    jaPedidos: 0,
    ops: [],
  }

  const gravou = await db
    .transaction(async (tx) => {
      for (const m of data.marcacoes) {
        // ⚠️ ON CONFLICT DO NOTHING, e não conferir antes: duas pessoas
        // marcando a mesma peça ao mesmo tempo passam por qualquer SELECT
        // prévio. O índice único parcial é quem decide; quem perdeu a
        // corrida cai no ramo do item que já existe.
        const [inserido] = await tx
          .insert(reposicoesEstoque)
          .values({
            produtoId: data.produtoId,
            variacaoId: m.variacaoId,
            situacao: m.situacao,
            quantidade: m.quantidade,
            observacao: data.observacao ?? null,
            marcadoPor: user.id,
          })
          .onConflictDoNothing()
          .returning({ id: reposicoesEstoque.id })

        // O item ativo que já existia, TRAVADO até o fim da transação: entre
        // ler o estado e ligar a OP, ninguém muda.
        const ativo = inserido
          ? null
          : ((
              await tx
                .select({
                  id: reposicoesEstoque.id,
                  estado: reposicoesEstoque.estado,
                  situacao: reposicoesEstoque.situacao,
                })
                .from(reposicoesEstoque)
                .where(
                  and(
                    eq(reposicoesEstoque.variacaoId, m.variacaoId),
                    inArray(reposicoesEstoque.estado, [
                      ...ESTADOS_ATIVOS_DE_REPOSICAO,
                    ]),
                  ),
                )
                .limit(1)
                .for('update')
            )[0] ?? null)
        const itemId = inserido?.id ?? ativo?.id
        // Nem inseriu nem achou: o item ativo saiu da fila no meio (reposto
        // ou apagado por outra pessoa). Não adivinha: desfaz e pede pra
        // atualizar.
        if (!itemId) throw new ReposicaoIndisponivel()

        const destino = destinoDaMarcacao(
          ativo
            ? { estado: ativo.estado as (typeof ESTADOS_ATIVOS_DE_REPOSICAO)[number] }
            : null,
          origem,
          data.criarOps,
        )
        if (destino === 'ja_em_producao') {
          resultado.jaEmProducao++
          continue
        }
        if (destino === 'ja_pedido_parceiro') {
          resultado.jaPedidos++
          continue
        }

        // Item aberto que já existia: a situação só SOBE, a quantidade é a
        // de agora. A observação da primeira marcação fica.
        const situacao = situacaoDepoisDaMarcacao(
          (ativo?.situacao as SituacaoDeReposicao | undefined) ?? null,
          m.situacao,
        )
        if (ativo) {
          const atualizados = await tx
            .update(reposicoesEstoque)
            .set({ situacao, quantidade: m.quantidade })
            .where(
              and(
                eq(reposicoesEstoque.id, ativo.id),
                eq(reposicoesEstoque.estado, 'aberto'),
              ),
            )
            .returning({ id: reposicoesEstoque.id })
          if (atualizados.length === 0) throw new ReposicaoIndisponivel()
          resultado.atualizados++
        } else {
          resultado.criados++
        }

        if (viraOp(destino)) {
          const op = await gravarOp(
            tx,
            {
              produtoId: data.produtoId,
              variacaoId: m.variacaoId,
              quantidade: m.quantidade,
              // REPOR ESTOQUE É CANAL ESTOQUE: a finalização só dá entrada
              // no estoque nesse canal (entrada-da-op.ts).
              canalDestino: 'estoque',
              prioridade: prioridadeDaSituacao(situacao),
              status: 'programado',
              // Sem prazo (Q202): se precisar, o gerente ajusta no quadro.
              dataPrevistaInicio: null,
              dataPrevistaFim: null,
              maquinaId: null,
              responsavelId: null,
              // A observação fica no ITEM. A da OP o operador lê no tablet,
              // e o recado de quem passou pela prateleira não é pra ele.
              observacoes: null,
              remessaFullId: null,
              orcamentoId: null,
              orcamentoFaltanteChave: null,
            },
            { usuarioId: user.id, reposicaoId: itemId },
          )
          resultado.ops.push(op.numero)
        }
      }
      return true
    })
    .catch((erro: unknown) => {
      if (erro instanceof ReposicaoIndisponivel) return false
      throw erro
    })
  if (!gravou) {
    return {
      success: false,
      error:
        'Alguma peça mudou na fila enquanto você marcava — nada foi gravado. Atualize a tela.',
    }
  }

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  if (resultado.ops.length > 0) {
    revalidatePath('/ordens')
    revalidatePath('/producao')
  }

  return {
    success: true,
    data: resultado,
    message: mensagemDaMarcacao(resultado),
  }
}

// "6 OPs criadas — OP-2026-0190 a 0195 · 1 já estava em produção"
function mensagemDaMarcacao(r: ResultadoDaMarcacao): string {
  const partes: string[] = []
  const semOp = r.criados + r.atualizados - r.ops.length
  if (r.ops.length > 0) {
    partes.push(
      `${r.ops.length === 1 ? '1 OP criada' : `${r.ops.length} OPs criadas`} — ${faixaDeNumeros(r.ops)}`,
    )
  }
  if (semOp > 0) {
    partes.push(
      semOp === 1 ? '1 peça foi pra fila' : `${semOp} peças foram pra fila`,
    )
  }
  if (r.jaEmProducao > 0) {
    partes.push(
      r.jaEmProducao === 1
        ? '1 já estava em produção'
        : `${r.jaEmProducao} já estavam em produção`,
    )
  }
  if (r.jaPedidos > 0) {
    partes.push(
      r.jaPedidos === 1
        ? '1 já estava pedida ao parceiro'
        : `${r.jaPedidos} já estavam pedidas ao parceiro`,
    )
  }
  return partes.join(' · ') || 'Nada mudou'
}

// -----------------------------------------------------------------
// Descartar (alarme falso) — apaga o item
// -----------------------------------------------------------------

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ⚠️ DESCARTAR APAGA A LINHA, e não grava `descartado`. Um aviso que foi
 * engano não tem história a guardar: ele ficava em "Atendidos" sem dizer
 * nada útil, e alguém precisaria apagar de novo. O estado `descartado` e as
 * colunas de descarte continuam no banco (59_reposicoes_estoque.sql), sem uso.
 */
export async function descartarReposicaoAction(
  id: string,
): Promise<ActionResult> {
  // Mesma permissão do "Produzir": decidir que a peça não precisa ser feita
  // é decisão de quem decide o que se produz.
  await requireAreaEscrita('ordens')
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  // ⚠️ SÓ ABERTO OU JÁ DESCARTADO. O em produção e o reposto têm OP ligada
  // (FK): apagar o primeiro deixaria a OP rodando pra repor uma peça que
  // ninguém pediu — cancela-se a OP, e o item volta pra fila sozinho
  // (src/lib/db/reposicao-da-op.ts) —, e o segundo é o registro de como a
  // peça foi reposta. O `descartado` entra pra limpar os que foram
  // descartados antes de descartar passar a apagar.
  const linhas = await db
    .delete(reposicoesEstoque)
    .where(
      and(
        eq(reposicoesEstoque.id, id),
        inArray(reposicoesEstoque.estado, ['aberto', 'descartado']),
      ),
    )
    .returning({ id: reposicoesEstoque.id })
  if (linhas.length === 0) {
    return {
      success: false,
      error: 'Esse item não está mais aberto — já tem OP ou foi atendido. Atualize a tela.',
    }
  }

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  return { success: true, message: 'Item descartado' }
}

// -----------------------------------------------------------------
// Produto de parceiro: "Pedir ao parceiro" e "Chegou"
// -----------------------------------------------------------------
//
// Produto comprado pronto nunca vira OP (src/lib/produtos/origem.ts), então o
// item dele não segue a OP: aberto → pedido_parceiro → reposto, à mão. A
// regra dos passos mora em `proximoEstadoDoParceiro` (reposicao.ts).
//
// Mesma permissão do "Produzir" e do "Descartar" (escrita em Ordens): decidir
// o que se repõe, e dar por reposto, é de quem decide o que se produz.
//
// ⚠️ O ESTADO ATUAL VAI NO WHERE, e não num SELECT antes: duas pessoas
// clicando juntas passam por qualquer conferência prévia. Quem perdeu a
// corrida recebe "já não está …" em vez de pedir duas vezes.

export async function pedirAoParceiroAction(id: string): Promise<ActionResult> {
  const user = await requireAreaEscrita('ordens')
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  const novo = proximoEstadoDoParceiro('aberto', 'pedir')!
  const linhas = await db
    .update(reposicoesEstoque)
    .set({
      estado: novo,
      pedidoParceiroEm: new Date(),
      pedidoParceiroPor: user.id,
    })
    .where(
      and(
        eq(reposicoesEstoque.id, id),
        eq(reposicoesEstoque.estado, 'aberto'),
        // A TELA PODE MENTIR: só produto de PARCEIRO se pede. O produzido
        // segue pelo "Produzir", que liga a OP.
        sql`EXISTS (
          SELECT 1 FROM "produtos"
           WHERE "produtos"."id" = "reposicoes_estoque"."produto_id"
             AND "produtos"."origem" = 'parceiro')`,
      ),
    )
    .returning({ id: reposicoesEstoque.id })
  if (linhas.length === 0) {
    return {
      success: false,
      error:
        'Esse item já não está em aberto, ou o produto não é de parceiro. Atualize a tela.',
    }
  }

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  return { success: true, message: 'Pedido ao parceiro' }
}

export async function chegouDoParceiroAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('ordens')
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  const novo = proximoEstadoDoParceiro('pedido_parceiro', 'chegou')!
  const linhas = await db
    .update(reposicoesEstoque)
    .set({ estado: novo, repostoEm: new Date() })
    .where(
      and(
        eq(reposicoesEstoque.id, id),
        eq(reposicoesEstoque.estado, 'pedido_parceiro'),
      ),
    )
    .returning({ id: reposicoesEstoque.id })
  if (linhas.length === 0) {
    return {
      success: false,
      error: 'Esse item não está mais esperando o parceiro. Atualize a tela.',
    }
  }

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  return { success: true, message: 'Chegou — reposto' }
}

// -----------------------------------------------------------------
// Pro sino e pro dashboard
// -----------------------------------------------------------------

export type ResumoDaReposicao = {
  acabou: number
  acabando: number
  /** Os abertos, "Acabou" primeiro — o card do dashboard mostra os primeiros. */
  itens: ItemDeReposicao[]
  maisAntigoEm: Date | null
}

/**
 * Só os ABERTOS: os em produção já têm OP e não pedem nada do gerente.
 *
 * ⚠️ NÃO REDIRECIONA quem não pode: o sino roda em toda página, e
 * `requireAreaEscrita` mandaria a pessoa pra outra tela só por abrir o sino.
 * Sem escrita em Ordens — quem decide o que se produz —, volta vazio.
 */
export async function resumoDaReposicao(): Promise<ResumoDaReposicao> {
  const user = await requireAuth()
  if (!podeEscrever(await nivelDaAreaPara(user.role, 'ordens'))) {
    return { acabou: 0, acabando: 0, itens: [], maisAntigoEm: null }
  }
  const rows = await consultaDeItens()
    .where(eq(reposicoesEstoque.estado, 'aberto'))
    .orderBy(asc(reposicoesEstoque.marcadoEm))
  const itens = ordenarFila(rows.map(paraItem))
  return {
    acabou: itens.filter((i) => i.situacao === 'acabou').length,
    acabando: itens.filter((i) => i.situacao === 'acabando').length,
    itens,
    maisAntigoEm: rows[0]?.marcadoEm ?? null,
  }
}
