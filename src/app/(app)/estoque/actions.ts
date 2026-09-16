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
  DIAS_DE_ATENDIDOS,
  erroDoDescarte,
  ordenarFila,
  podeSubirSituacao,
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

export type ItemDeReposicao = {
  id: string
  produtoId: string
  produtoNome: string
  variacaoId: string
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
  corHex: string | null
  corHex2: string | null
  /** A variação saiu do catálogo depois da marcação: não dá pra produzir. */
  foraDoCatalogo: boolean
  situacao: SituacaoDeReposicao
  observacao: string | null
  marcadoPorNome: string | null
  marcadoEm: Date
  estado: EstadoDeReposicao
  opId: string | null
  opNumero: string | null
  opStatus: (typeof statusValues)[number] | null
  repostoEm: Date | null
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
      observacao: reposicoesEstoque.observacao,
      marcadoPorNome: marcou.nome,
      marcadoEm: reposicoesEstoque.marcadoEm,
      estado: reposicoesEstoque.estado,
      opId: ordensProducao.id,
      opNumero: ordensProducao.numero,
      opStatus: ordensProducao.status,
      repostoEm: reposicoesEstoque.repostoEm,
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
    .leftJoin(ordensProducao, eq(ordensProducao.id, reposicoesEstoque.ordemId))
}

type LinhaDeItem = Awaited<ReturnType<typeof consultaDeItens>>[number]

function paraItem(r: LinhaDeItem): ItemDeReposicao {
  return {
    id: r.id,
    produtoId: r.produtoId,
    produtoNome: r.produtoNome,
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
    observacao: r.observacao,
    marcadoPorNome: r.marcadoPorNome ?? null,
    marcadoEm: r.marcadoEm,
    estado: r.estado as EstadoDeReposicao,
    opId: r.opId ?? null,
    opNumero: r.opNumero ?? null,
    opStatus: r.opStatus ?? null,
    repostoEm: r.repostoEm,
    descartadoEm: r.descartadoEm,
    descartadoPorNome: r.descartadoPorNome ?? null,
    motivoDescarte: r.motivoDescarte,
  }
}

/** A fila: aberto e em produção, "Acabou" primeiro e o mais antigo antes. */
export async function listarFilaDeReposicao(): Promise<ItemDeReposicao[]> {
  await requireArea('estoque')
  const rows = await consultaDeItens().where(
    inArray(reposicoesEstoque.estado, ['aberto', 'em_producao']),
  )
  return ordenarFila(rows.map(paraItem))
}

/** Repostos e descartados dos últimos 30 dias, o mais recente primeiro. */
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
// Marcar peças acabando
// -----------------------------------------------------------------

export type ResultadoDaMarcacao = {
  criados: number
  subiram: number
  jaNaFila: number
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

  // A VARIAÇÃO TEM QUE SER DO PRODUTO E ESTAR NO CATÁLOGO. A FK sozinha aceita
  // variação de outro produto — o mesmo cuidado de `criarOrdemAction`.
  const ids = data.marcacoes.map((m) => m.variacaoId)
  const validas = await db
    .select({ id: variacoesProduto.id })
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

  const resultado: ResultadoDaMarcacao = { criados: 0, subiram: 0, jaNaFila: 0 }

  await db.transaction(async (tx) => {
    for (const m of data.marcacoes) {
      // ⚠️ ON CONFLICT DO NOTHING, e não conferir antes: duas pessoas
      // marcando a mesma peça ao mesmo tempo passam por qualquer SELECT
      // prévio. O índice único parcial é quem decide; quem perdeu a corrida
      // cai no ramo de baixo, como "já estava na fila".
      const inseridos = await tx
        .insert(reposicoesEstoque)
        .values({
          produtoId: data.produtoId,
          variacaoId: m.variacaoId,
          situacao: m.situacao,
          observacao: data.observacao ?? null,
          marcadoPor: user.id,
        })
        .onConflictDoNothing()
        .returning({ id: reposicoesEstoque.id })
      if (inseridos.length > 0) {
        resultado.criados++
        continue
      }

      const [ativo] = await tx
        .select({
          id: reposicoesEstoque.id,
          situacao: reposicoesEstoque.situacao,
        })
        .from(reposicoesEstoque)
        .where(
          and(
            eq(reposicoesEstoque.variacaoId, m.variacaoId),
            inArray(reposicoesEstoque.estado, ['aberto', 'em_producao']),
          ),
        )
        .limit(1)
      // Só SOBE: "acabando" vira "acabou". A observação da primeira marcação
      // fica — quem marcou de novo só está dizendo que piorou.
      if (
        ativo &&
        podeSubirSituacao(ativo.situacao as SituacaoDeReposicao, m.situacao)
      ) {
        await tx
          .update(reposicoesEstoque)
          .set({ situacao: 'acabou' })
          .where(
            and(
              eq(reposicoesEstoque.id, ativo.id),
              eq(reposicoesEstoque.situacao, 'acabando'),
            ),
          )
        resultado.subiram++
      } else {
        resultado.jaNaFila++
      }
    }
  })

  revalidatePath('/estoque')
  revalidatePath('/dashboard')

  const partes: string[] = []
  if (resultado.criados > 0) {
    partes.push(
      resultado.criados === 1
        ? '1 peça entrou na fila'
        : `${resultado.criados} peças entraram na fila`,
    )
  }
  if (resultado.subiram > 0) {
    partes.push(
      resultado.subiram === 1
        ? '1 passou pra "Acabou"'
        : `${resultado.subiram} passaram pra "Acabou"`,
    )
  }
  if (resultado.jaNaFila > 0) {
    partes.push(
      resultado.jaNaFila === 1
        ? '1 já estava na fila'
        : `${resultado.jaNaFila} já estavam na fila`,
    )
  }
  return { success: true, data: resultado, message: partes.join(' · ') }
}

// -----------------------------------------------------------------
// Descartar (alarme falso)
// -----------------------------------------------------------------

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function descartarReposicaoAction(
  id: string,
  /** Opcional: em branco vira nulo. */
  motivo?: string | null,
): Promise<ActionResult> {
  // Mesma permissão do "Produzir": decidir que a peça não precisa ser feita
  // é decisão de quem decide o que se produz.
  const user = await requireAreaEscrita('ordens')
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }
  const erro = erroDoDescarte(motivo)
  if (erro) return { success: false, error: erro }

  // ⚠️ SÓ O ITEM ABERTO. O em produção já tem OP: descartar deixaria a OP
  // rodando pra repor uma peça que "não precisava". Cancela-se a OP, e o
  // item volta pra fila sozinho (src/lib/db/reposicao-da-op.ts).
  const linhas = await db
    .update(reposicoesEstoque)
    .set({
      estado: 'descartado',
      descartadoEm: new Date(),
      descartadoPor: user.id,
      motivoDescarte: motivo?.trim() || null,
    })
    .where(
      and(eq(reposicoesEstoque.id, id), eq(reposicoesEstoque.estado, 'aberto')),
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
