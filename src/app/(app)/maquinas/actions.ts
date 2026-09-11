'use server'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'

import { podeEscrever } from '@/lib/auth/permissoes'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { estacaoDoOperador } from '@/lib/db/estacao-operadores'
import {
  estacoes,
  maquinas,
  ordensProducao,
  produtos,
  users,
  variacoesProduto,
  type Maquina,
  type User,
} from '@/lib/db/schema'
import {
  maquinaSchema,
  maquinasFiltrosSchema,
  trocarStatusMaquinaSchema,
  type MaquinaInput,
  type MaquinasFiltros,
  type TrocarStatusMaquinaInput,
} from '@/lib/validators/maquinas'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

// O responsável da OP é OUTRA junção com `users`, além do `operador_atual`
// da máquina — daí o alias. São duas perguntas diferentes: quem está
// cadastrado como operador da máquina (campo legado, ver o comentário de
// `trocarStatusAction`) e quem PEGOU a OP que está rodando ali. É a segunda
// que a tela mostra como "responsável registrado".
const responsavel = alias(users, 'responsavel_op')

/** A OP que está EM PRODUÇÃO na máquina. Nula quando a máquina está livre. */
export type OpDaMaquina = {
  id: string
  numero: string
  quantidade: number
  produtoNome: string
  variacaoCor: string | null
  variacaoModelo: string | null
  variacaoTamanho: string | null
  responsavelNome: string | null
}

export type MaquinaListItem = Maquina & {
  operadorNome: string | null
  operadorEmail: string | null
  estacaoNome: string | null
  /**
   * ⚠️ É DAQUI QUE SAI A OCUPAÇÃO, e não de `status`. A tela passa isto pra
   * `situacaoDaMaquina` (src/lib/producao/estado-maquina.ts), que é a mesma
   * função usada pela tela do operador e pelo seletor do kanban.
   */
  op: OpDaMaquina | null
}

export async function listarMaquinas(
  filtros: MaquinasFiltros = {},
): Promise<MaquinaListItem[]> {
  await requireAuth()

  const parsed = maquinasFiltrosSchema.safeParse(filtros)
  const { status } = parsed.success ? parsed.data : {}

  const conditions = [isNull(maquinas.deletedAt)]
  if (status && status !== 'todos') conditions.push(eq(maquinas.status, status))

  // ⚠️ A OP EM PRODUÇÃO ENTRA AQUI, e essa é a correção central desta tela.
  // Antes a lista só lia `maquinas.status` — cadastro que alguém marca e
  // ninguém desmarca — e o resultado em produção era as 18 máquinas dizendo
  // "Operando" com ZERO OPs rodando. Ocupação sai da OP, nunca do cadastro:
  // ver src/lib/producao/estado-maquina.ts.
  //
  // O LEFT JOIN não duplica a linha da máquina: o índice único
  // `ordens_producao_maquina_em_producao_uidx` (migration 50) garante no
  // máximo uma OP `em_producao` por máquina. É o mesmo recorte que a tela do
  // operador e a validação do servidor usam — 'pronto_envio' libera de
  // propósito, senão as máquinas iriam ficando ocupadas sem ninguém produzir.
  const rows = await db
    .select({
      m: maquinas,
      operadorNome: users.nome,
      operadorEmail: users.email,
      estacaoNome: estacoes.nome,
      opId: ordensProducao.id,
      opNumero: ordensProducao.numero,
      opQuantidade: ordensProducao.quantidade,
      produtoNome: produtos.nome,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      responsavelNome: responsavel.nome,
    })
    .from(maquinas)
    // ⚠️ FILTRA `deletedAt` DO USUÁRIO. Sem isso a aba exibia "Operador de
    // Tear" em três máquinas — um usuário APAGADO e inativo, que é o único
    // `operador_atual` que existe no banco. Nome de gente excluída na tela é
    // o tipo de erro que ninguém reporta porque parece cadastro velho.
    .leftJoin(
      users,
      and(eq(users.id, maquinas.operadorAtualId), isNull(users.deletedAt)),
    )
    .leftJoin(estacoes, eq(estacoes.id, maquinas.estacaoId))
    .leftJoin(
      ordensProducao,
      and(
        eq(ordensProducao.maquinaId, maquinas.id),
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .leftJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .leftJoin(
      variacoesProduto,
      eq(variacoesProduto.id, ordensProducao.variacaoId),
    )
    .leftJoin(responsavel, eq(responsavel.id, ordensProducao.responsavelId))
    .where(and(...conditions))
    .orderBy(asc(maquinas.codigo))

  return rows.map((r) => ({
    ...r.m,
    operadorNome: r.operadorNome ?? null,
    operadorEmail: r.operadorEmail ?? null,
    estacaoNome: r.estacaoNome ?? null,
    op:
      r.opId === null
        ? null
        : {
            id: r.opId,
            numero: r.opNumero!,
            quantidade: r.opQuantidade!,
            produtoNome: r.produtoNome ?? '—',
            variacaoCor: r.variacaoCor ?? null,
            variacaoModelo: r.variacaoModelo ?? null,
            variacaoTamanho: r.variacaoTamanho ?? null,
            responsavelNome: r.responsavelNome ?? null,
          },
  }))
}

// Lista de operadores ativos (pra usar em selects).
export async function listarOperadores(): Promise<
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
    .where(and(eq(users.ativo, true), isNull(users.deletedAt)))
    .orderBy(asc(users.nome))
}

export async function obterMaquina(id: string): Promise<Maquina | null> {
  await requireAuth()
  const [m] = await db
    .select()
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  return m ?? null
}

// -----------------------------------------------------------------
// Criar
// -----------------------------------------------------------------

export async function criarMaquinaAction(
  input: MaquinaInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('maquinas')

  const parsed = maquinaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const codigoUpper = data.codigo.toUpperCase()
  const existing = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.codigo, codigoUpper), isNull(maquinas.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return { success: false, error: `Já existe uma máquina com código "${codigoUpper}"` }
  }

  const [inserted] = await db
    .insert(maquinas)
    .values({
      codigo: codigoUpper,
      nome: data.nome,
      status: data.status,
      operadorAtualId: data.operadorAtualId,
      observacoes: data.observacoes ?? null,
    })
    .returning({ id: maquinas.id })

  revalidatePath('/maquinas')
  return { success: true, data: { id: inserted!.id }, message: 'Máquina criada' }
}

// -----------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------

export async function atualizarMaquinaAction(
  id: string,
  input: MaquinaInput,
): Promise<ActionResult> {
  await requireAreaEscrita('maquinas')

  const parsed = maquinaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Máquina não encontrada' }
  }

  // Código único entre OUTRAS máquinas.
  const codigoUpper = data.codigo.toUpperCase()
  const conflicting = await db
    .select({ id: maquinas.id })
    .from(maquinas)
    .where(and(eq(maquinas.codigo, codigoUpper), isNull(maquinas.deletedAt)))
    .limit(1)
  if (conflicting.length > 0 && conflicting[0]!.id !== id) {
    return {
      success: false,
      error: `Já existe outra máquina com código "${codigoUpper}"`,
    }
  }

  await db
    .update(maquinas)
    .set({
      codigo: codigoUpper,
      nome: data.nome,
      status: data.status,
      operadorAtualId: data.operadorAtualId,
      observacoes: data.observacoes ?? null,
    })
    .where(eq(maquinas.id, id))

  revalidatePath('/maquinas')
  revalidatePath(`/maquinas/${id}`)
  return { success: true, message: 'Máquina atualizada' }
}

// -----------------------------------------------------------------
// Quick action: trocar a DISPONIBILIDADE da máquina
// -----------------------------------------------------------------
//
// ⚠️ ISTO NÃO DECLARA OCUPAÇÃO. Trocar o status diz se a máquina PODE
// produzir (manutenção, desativada, apta); quem diz se ela ESTÁ produzindo é
// a OP. Era aqui que "Operando" entrava à mão e fazia a aba inteira mentir.
//
// ⚠️ PASSA PELA ÁREA `maquinas`, e antes não passava. A versão anterior usava
// `requireAuth()` + `isManagerRole(user.role) || atual.operadorAtualId ===
// user.id` — ou seja, ignorava /permissoes. Em produção o operador está como
// `ver` naquela área, e mesmo assim poderia escrever por esta porta. É
// exatamente o "a tela promete uma coisa e a action entrega outra" que o
// AGENTS.md proíbe.
//
// O `operador_atual_id` some da conta de propósito: no banco ele aponta, em
// três máquinas, pra um usuário APAGADO — e os três operadores reais não são
// `operador_atual` de nada. Quem responde "este operador manda nesta
// máquina?" é a ESTAÇÃO (`estacao_operadores`), que é o que a tela do
// operador já usa. A coluna continua no banco; ver a nota em `listarMaquinas`.
export async function trocarStatusAction(
  id: string,
  input: TrocarStatusMaquinaInput,
): Promise<ActionResult> {
  const user = await requireAuth()

  const parsed = trocarStatusMaquinaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select()
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Máquina não encontrada' }
  }

  // Admin e gerente pelo nível da área; o operador, só nas máquinas da
  // estação DELE — a mesma regra que já governa o que ele enxerga e move na
  // produção (src/lib/db/estacao-operadores.ts).
  const podeAlterar = podeEscrever(await nivelDaAreaPara(user.role, 'maquinas'))
  if (!podeAlterar) {
    if (user.role !== 'operador') {
      return { success: false, error: 'Sem permissão pra alterar máquinas' }
    }
    const estacao = await estacaoDoOperador(user.id)
    if (!estacao || estacao.id !== atual.estacaoId) {
      return {
        success: false,
        error: 'Essa máquina não é da sua estação',
      }
    }
  }

  await db
    .update(maquinas)
    .set({
      status: data.status,
      observacoes: data.observacoes ?? atual.observacoes,
    })
    .where(eq(maquinas.id, id))

  // ⚠️ A LISTA VIVE EM /fabrica, não em /maquinas — aquela rota só
  // redireciona. Revalidar só /maquinas nunca invalidou a tela que o usuário
  // está olhando; funcionava por causa do `router.refresh()` do cliente.
  revalidatePath('/fabrica')
  revalidatePath('/maquinas')
  revalidatePath('/producao')
  return { success: true, message: 'Situação atualizada' }
}

// -----------------------------------------------------------------
// Soft delete
// -----------------------------------------------------------------

export async function excluirMaquinaAction(id: string): Promise<ActionResult> {
  await requireAreaEscrita('maquinas')

  const [atual] = await db
    .select({ id: maquinas.id, codigo: maquinas.codigo })
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Máquina não encontrada' }
  }

  // ⚠️ MÁQUINA COM OP EM PRODUÇÃO NÃO SE EXCLUI, e o motivo é pior do que
  // "seria estranho". O índice único `ordens_producao_maquina_em_producao_uidx`
  // tem `deleted_at IS NULL` no predicado: apagar a máquina SOLTA o índice, a
  // OP continua `em_producao` apontando pra uma máquina excluída, e some da
  // tela do operador (que filtra máquina apagada). O trabalho fica preso e
  // invisível, sem nenhum erro.
  const [emProducao] = await db
    .select({ numero: ordensProducao.numero })
    .from(ordensProducao)
    .where(
      and(
        eq(ordensProducao.maquinaId, id),
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .limit(1)
  if (emProducao) {
    return {
      success: false,
      error: `A ${atual.codigo} está com a OP ${emProducao.numero} em produção. Conclua ou mova a OP antes de excluir.`,
    }
  }

  await db
    .update(maquinas)
    .set({ deletedAt: new Date(), status: 'desativada', operadorAtualId: null })
    .where(eq(maquinas.id, id))

  revalidatePath('/fabrica')
  revalidatePath('/maquinas')
  revalidatePath('/producao')
  return { success: true, message: 'Máquina excluída' }
}
