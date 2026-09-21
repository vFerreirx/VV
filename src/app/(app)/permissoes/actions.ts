'use server'

import { and, eq, notInArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import {
  AREAS,
  ehAreaDesconhecida,
  opcaoDoNivel,
  planoDeGravacao,
  ROLES_EDITAVEIS,
  type AreaKey,
  type OpcaoNivel,
  type Role,
} from '@/lib/auth/permissoes'
import { db } from '@/lib/db'
import { permissoesAcesso } from '@/lib/db/schema'

export type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }

export type ItemPermissao = { role: Role; area: AreaKey; nivel: OpcaoNivel }

/**
 * Salva a tela inteira: grava SÓ o que difere do padrão e APAGA o que voltou
 * a ser igual a ele.
 *
 * ⚠️ QUEM DECIDE É `planoDeGravacao` (src/lib/auth/permissoes.ts), e o porquê
 * de gravar só a diferença está lá: antes, salvar carimbava override em todas
 * as 76 células e o `nivelPadrao` do código virava decoração. A consequência
 * — célula "no padrão" passa a seguir o código — também está escrita lá.
 *
 * Tudo numa transação: meia tela salva deixaria permissão pela metade, e
 * permissão pela metade é alguém sem conseguir trabalhar ou vendo o que não
 * devia.
 */
export async function salvarPermissoesAction(
  itens: ItemPermissao[],
): Promise<ActionResult> {
  const admin = await requireRole(['admin'])

  const { upserts, remocoes } = planoDeGravacao(itens)
  if (upserts.length === 0 && remocoes.length === 0) {
    return { success: false, error: 'Nada pra salvar' }
  }

  await db.transaction(async (tx) => {
    for (const i of upserts) {
      await tx
        .insert(permissoesAcesso)
        .values({
          role: i.role,
          area: i.area,
          nivel: i.nivel,
          atualizadoPor: admin.id,
        })
        .onConflictDoUpdate({
          target: [permissoesAcesso.role, permissoesAcesso.area],
          set: { nivel: i.nivel, atualizadoPor: admin.id },
        })
    }
    for (const r of remocoes) {
      await tx
        .delete(permissoesAcesso)
        .where(
          and(
            eq(permissoesAcesso.role, r.role),
            eq(permissoesAcesso.area, r.area),
          ),
        )
    }
  })

  // Revalida o layout pra o menu refletir o novo acesso na hora.
  revalidatePath('/', 'layout')
  return { success: true, message: 'Permissões atualizadas' }
}

// -----------------------------------------------------------------
// Manutenção — as duas limpezas, SEMPRE por clique do admin
// -----------------------------------------------------------------
//
// ⚠️ NENHUMA DELAS RODA SOZINHA. São os únicos DELETEs desta tela, e apagam
// linha de permissão: rodar no deploy, ou junto do salvamento, seria mexer em
// quem abre o quê sem ninguém ter pedido. A tela mostra a contagem, o admin
// clica, e a action recalcula no momento do clique — o número da tela pode
// estar velho, o da action não.

export type ContagemDeLimpeza = { iguaisAoPadrao: number; orfas: number }

/** Quantas linhas cada limpeza apagaria agora. Só leitura. */
export async function contarLimpezasDePermissao(): Promise<ContagemDeLimpeza> {
  await requireRole(['admin'])
  const linhas = await db
    .select({
      role: permissoesAcesso.role,
      area: permissoesAcesso.area,
      nivel: permissoesAcesso.nivel,
    })
    .from(permissoesAcesso)

  let iguaisAoPadrao = 0
  let orfas = 0
  for (const l of linhas) {
    if (ehAreaDesconhecida(l.area)) {
      orfas += 1
      continue
    }
    const area = AREAS.find((a) => a.key === l.area)
    if (!area || !area.editavel) continue
    if (!ROLES_EDITAVEIS.includes(l.role as Role)) continue
    if (
      opcaoDoNivel(l.nivel as never) ===
      opcaoDoNivel(area.nivelPadrao[l.role as Role])
    ) {
      iguaisAoPadrao += 1
    }
  }
  return { iguaisAoPadrao, orfas }
}

/**
 * Apaga as linhas que só repetem o padrão do código.
 *
 * Não muda NADA do que cada cargo enxerga: a linha apagada dizia exatamente o
 * que o padrão já diz. O que muda é o futuro — dali em diante, essa célula
 * acompanha o código em vez de ficar congelada no valor de um salvamento
 * antigo.
 */
export async function limparPermissoesIguaisAoPadraoAction(): Promise<
  ActionResult
> {
  await requireRole(['admin'])

  const linhas = await db
    .select({
      role: permissoesAcesso.role,
      area: permissoesAcesso.area,
      nivel: permissoesAcesso.nivel,
    })
    .from(permissoesAcesso)

  // Reaproveita a MESMA regra do salvamento: o que ela mandaria remover é
  // exatamente o que está igual ao padrão.
  const { remocoes } = planoDeGravacao(
    linhas.map((l) => ({
      role: l.role as Role,
      area: l.area as AreaKey,
      nivel: opcaoDoNivel(l.nivel as never),
    })),
  )
  if (remocoes.length === 0) {
    return { success: true, message: 'Nenhuma linha igual ao padrão' }
  }

  await db.transaction(async (tx) => {
    for (const r of remocoes) {
      await tx
        .delete(permissoesAcesso)
        .where(
          and(
            eq(permissoesAcesso.role, r.role),
            eq(permissoesAcesso.area, r.area),
          ),
        )
    }
  })

  revalidatePath('/', 'layout')
  return {
    success: true,
    message:
      remocoes.length === 1
        ? '1 linha igual ao padrão apagada'
        : `${remocoes.length} linhas iguais ao padrão apagadas`,
  }
}

/**
 * Apaga linha de área que não existe mais (hoje: 'relatorios', que virou aba
 * de Vendas).
 *
 * O filtro é "chave que não está em AREAS", e não uma lista fixa de nomes:
 * assim continua servindo na próxima área renomeada, sem ninguém lembrar de
 * atualizar esta função. `nivelEfetivo` já ignora essas linhas — elas não
 * fazem efeito, só poluem a tabela e confundem quem for auditar.
 */
export async function limparPermissoesOrfasAction(): Promise<ActionResult> {
  await requireRole(['admin'])

  const chavesVivas = AREAS.map((a) => a.key as string)
  const apagadas = await db
    .delete(permissoesAcesso)
    .where(notInArray(permissoesAcesso.area, chavesVivas))
    .returning({ area: permissoesAcesso.area })

  if (apagadas.length === 0) {
    return { success: true, message: 'Nenhuma linha órfã' }
  }
  const areas = [...new Set(apagadas.map((a) => a.area))].join(', ')
  return {
    success: true,
    message:
      apagadas.length === 1
        ? `1 linha órfã apagada (${areas})`
        : `${apagadas.length} linhas órfãs apagadas (${areas})`,
  }
}
