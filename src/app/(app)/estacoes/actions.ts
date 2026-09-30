'use server'

import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import {
  isManager,
  requireArea,
  requireAreaEscrita,
  requireAuth,
} from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  estacoes,
  maquinas,
  ordensProducao,
  users,
  type Estacao,
} from '@/lib/db/schema'
import {
  estacaoSchema,
  motivoParaNaoExcluirEstacao,
  type EstacaoInput,
} from '@/lib/validators/estacoes'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// Uma máquina da estação, como o cartão e o diálogo de exclusão mostram.
export type MaquinaDaEstacaoResumo = {
  id: string
  /** O número da máquina — o nome sai de `nomeDaMaquina`. */
  numero: number
  /** Número da OP em produção nela agora, ou null. Prende a exclusão. */
  opEmProducao: string | null
}

// A estação é NOME, COR E MÁQUINAS — o lugar de um tablet na fábrica. Não tem
// operador: ele não pertence a estação nenhuma e age em qualquer máquina
// (src/lib/db/acao-do-operador.ts). A tabela `estacao_operadores` continua no
// banco com os vínculos antigos, e ninguém lê nem grava mais nela.
export type EstacaoComDetalhes = Estacao & {
  maquinaIds: string[]
  maquinas: MaquinaDaEstacaoResumo[]
}

// Um operador ativo, pro quadro de operadores e pra faixa de pendências da
// /fabrica. Sem estação, de propósito — ver acima.
export type OperadorOpcao = {
  id: string
  nome: string
  /** Só o booleano, pro checklist da /fabrica. O hash nunca sai daqui. */
  temPin: boolean
}
// `estacao*` é a estação ATUAL da máquina: o diálogo mostra "Máquina 7 ·
// Estação 1" e avisa antes de tirá-la de lá.
export type MaquinaOpcao = {
  id: string
  numero: number
  estacaoId: string | null
  estacaoNome: string | null
}

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarEstacoes(): Promise<EstacaoComDetalhes[]> {
  await requireArea('estacoes')

  const rows = await db
    .select()
    .from(estacoes)
    .where(isNull(estacoes.deletedAt))
    .orderBy(asc(estacoes.nome))

  if (rows.length === 0) return []

  // NÃO lê operadorDiaId/operadorNoiteId: são legado.
  const ids = rows.map((e) => e.id)

  const maqs = await db
    .select({
      id: maquinas.id,
      numero: maquinas.numero,
      estacaoId: maquinas.estacaoId,
      opEmProducao: ordensProducao.numero,
    })
    .from(maquinas)
    // A OP em produção, pro diálogo de exclusão saber que não pode. Não
    // duplica a máquina: `ordens_producao_maquina_em_producao_uidx` garante
    // no máximo uma OP `em_producao` por máquina.
    .leftJoin(
      ordensProducao,
      and(
        eq(ordensProducao.maquinaId, maquinas.id),
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .where(and(isNull(maquinas.deletedAt), inArray(maquinas.estacaoId, ids)))
    // Pelo NÚMERO: a 2 antes da 10 (src/lib/producao/nome-da-maquina.ts).
    .orderBy(asc(maquinas.numero))

  return rows.map((e) => {
    const minhas = maqs.filter((m) => m.estacaoId === e.id)
    return {
      ...e,
      maquinaIds: minhas.map((m) => m.id),
      maquinas: minhas.map((m) => ({
        id: m.id,
        numero: m.numero,
        opEmProducao: m.opEmProducao ?? null,
      })),
    }
  })
}

// Operadores ativos — todos aparecem em todo tablet.
//
// ⚠️ Pode voltar VAZIO: em 02/09 não existia nenhum usuário com cargo
// `operador`. Quem trata esse caso é a tela — ela precisa dizer isso com todas
// as letras e apontar pra /usuarios. É a faixa de pendências da /fabrica
// (`nenhumOperadorAtivo`, em fabrica/page.tsx) e o quadro de operadores.
export async function listarOperadores(): Promise<OperadorOpcao[]> {
  await requireArea('estacoes')
  const rows = await db
    .select({
      id: users.id,
      nome: users.nome,
      pinHash: users.pinHash,
    })
    .from(users)
    .where(
      and(eq(users.role, 'operador'), eq(users.ativo, true), isNull(users.deletedAt)),
    )
    .orderBy(asc(users.nome))

  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    // O map descarta o hash ANTES de sair da função: isto é 'use server' e
    // o retorno viaja pro cliente.
    temPin: r.pinHash !== null,
  }))
}

// Máquinas ativas (pra multi-select).
export async function listarMaquinasOpcoes(): Promise<MaquinaOpcao[]> {
  await requireArea('estacoes')
  return db
    .select({
      id: maquinas.id,
      numero: maquinas.numero,
      // Pelo JOIN, e não por `maquinas.estacao_id`: estação excluída não
      // conta como "a estação dela".
      estacaoId: estacoes.id,
      estacaoNome: estacoes.nome,
    })
    .from(maquinas)
    .leftJoin(
      estacoes,
      and(eq(estacoes.id, maquinas.estacaoId), isNull(estacoes.deletedAt)),
    )
    .where(isNull(maquinas.deletedAt))
    .orderBy(asc(maquinas.numero))
}

// -----------------------------------------------------------------
// Criar / atualizar (com atribuição de máquinas)
// -----------------------------------------------------------------

async function aplicarMaquinas(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  estacaoId: string,
  maquinaIds: string[],
) {
  // Desvincula as que estavam nesta estação mas saíram da seleção.
  await tx
    .update(maquinas)
    .set({ estacaoId: null })
    .where(eq(maquinas.estacaoId, estacaoId))
  // Vincula as selecionadas (tira de outra estação se preciso).
  if (maquinaIds.length > 0) {
    await tx
      .update(maquinas)
      .set({ estacaoId })
      .where(inArray(maquinas.id, maquinaIds))
  }
}

export async function criarEstacaoAction(
  input: EstacaoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('estacoes')

  const parsed = estacaoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const existing = await db
    .select({ id: estacoes.id })
    .from(estacoes)
    .where(and(eq(estacoes.nome, data.nome), isNull(estacoes.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe uma estação "${data.nome}"` }
  }

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(estacoes)
      .values({ nome: data.nome, cor: data.cor ?? null })
      .returning({ id: estacoes.id })
    await aplicarMaquinas(tx, inserted!.id, data.maquinaIds ?? [])
    return inserted!.id
  })

  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, data: { id: novoId }, message: 'Estação criada' }
}

export async function atualizarEstacaoAction(
  id: string,
  input: EstacaoInput,
): Promise<ActionResult> {
  await requireAreaEscrita('estacoes')

  const parsed = estacaoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: estacoes.id })
    .from(estacoes)
    .where(and(eq(estacoes.id, id), isNull(estacoes.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Estação não encontrada' }

  // Nome único entre OUTRAS estações.
  const conflito = await db
    .select({ id: estacoes.id })
    .from(estacoes)
    .where(
      and(
        eq(estacoes.nome, data.nome),
        isNull(estacoes.deletedAt),
        ne(estacoes.id, id),
      ),
    )
    .limit(1)
  if (conflito.length > 0) {
    return { success: false, error: `Já existe outra estação "${data.nome}"` }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(estacoes)
      .set({ nome: data.nome, cor: data.cor ?? null })
      .where(eq(estacoes.id, id))
    await aplicarMaquinas(tx, id, data.maquinaIds ?? [])
  })

  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, message: 'Estação atualizada' }
}

// -----------------------------------------------------------------
// Excluir (soft delete + solta as máquinas)
// -----------------------------------------------------------------

export async function excluirEstacaoAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('estacoes')

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) return { success: false, error: 'ID inválido' }

  // ⚠️ OP EM PRODUÇÃO PRENDE A ESTAÇÃO — ver `motivoParaNaoExcluirEstacao`.
  // Conferido DENTRO da transação, e a recusa desfaz tudo: nada é gravado.
  const recusa = await db.transaction(async (tx) => {
    const presas = await tx
      .select({ numero: maquinas.numero, opEmProducao: ordensProducao.numero })
      .from(maquinas)
      .innerJoin(
        ordensProducao,
        and(
          eq(ordensProducao.maquinaId, maquinas.id),
          eq(ordensProducao.status, 'em_producao'),
          isNull(ordensProducao.deletedAt),
        ),
      )
      .where(and(eq(maquinas.estacaoId, id), isNull(maquinas.deletedAt)))
      .orderBy(asc(maquinas.numero))
    const motivo = motivoParaNaoExcluirEstacao(presas)
    if (motivo) return motivo

    await tx
      .update(estacoes)
      .set({ deletedAt: new Date(), ativo: false })
      .where(and(eq(estacoes.id, id), isNull(estacoes.deletedAt)))
    await tx
      .update(maquinas)
      .set({ estacaoId: null })
      .where(eq(maquinas.estacaoId, id))
    // Os vínculos antigos de `estacao_operadores` ficam como estão: ninguém
    // lê nem grava mais nela, e apagar dado é combinado à parte.
    //
    // O tablet desta estação passa a ter no cookie uma estação apagada, e
    // `estacaoDoAparelho` lê isso como "sem estação": ele mostra a faixa
    // "chame o gerente" até alguém definir outra em "Este aparelho".
    return null
  })
  if (recusa) return { success: false, error: recusa }

  // A lista vive em /fabrica; /estacoes só redireciona.
  revalidatePath('/fabrica')
  revalidatePath('/estacoes')
  revalidatePath('/producao')
  return { success: true, message: 'Estação excluída' }
}

// -----------------------------------------------------------------
// Limpar o PIN de um operador
// -----------------------------------------------------------------

/**
 * Zera o PIN do operador: ele cria um novo no próximo toque do tablet.
 *
 * ⚠️ NÃO EXISTIA CAMINHO NENHUM PRA ISSO. O operador cria o PIN sozinho no
 * tablet ((auth)/login/actions.ts), e errar demais bloqueia — quem esquecia só
 * voltava com SQL no banco. Com 3 tablets rodando, isso acontece na primeira
 * semana, e a pessoa que trava é a que está no meio do turno.
 *
 * Zera os TRÊS campos juntos: hash, contador de tentativas e o bloqueio. Só o
 * hash deixaria o operador travado pelo bloqueio antigo na hora de cadastrar
 * o PIN novo — que é o caso mais comum de quem precisa disto.
 *
 * ⚠️ O HASH NUNCA SAI DAQUI: a tela trabalha com o booleano `temPin`, e é
 * assim que continua. Quem pode: admin e gerente de produção (`isManager`) —
 * é operação de chão de fábrica, e o gerente é quem está lá.
 */
export async function limparPinAction(
  operadorId: string,
): Promise<ActionResult> {
  const user = await requireAuth()
  if (!isManager(user.role)) {
    return { success: false, error: 'Sem permissão pra limpar o PIN' }
  }
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(operadorId)) {
    return { success: false, error: 'ID inválido' }
  }

  const [alvo] = await db
    .select({ id: users.id, nome: users.nome, role: users.role })
    .from(users)
    .where(and(eq(users.id, operadorId), isNull(users.deletedAt)))
    .limit(1)
  if (!alvo) return { success: false, error: 'Operador não encontrado' }
  if (alvo.role !== 'operador') {
    return { success: false, error: 'Só o PIN de operador é limpo por aqui' }
  }

  await db
    .update(users)
    .set({ pinHash: null, pinTentativas: 0, pinBloqueadoAte: null })
    .where(eq(users.id, operadorId))

  revalidatePath('/fabrica')
  revalidatePath('/producao')
  return {
    success: true,
    message: `PIN de ${alvo.nome} limpo — ele cria um novo no próximo toque`,
  }
}
