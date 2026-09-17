'use server'

import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'

import { podeEscrever } from '@/lib/auth/permissoes'
import { recusaSeTabletTravado } from '@/lib/auth/tablet-travado'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { requireAuth, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { estacaoDoOperador } from '@/lib/db/estacao-operadores'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import {
  estacoes,
  maquinaParadas,
  maquinas,
  ordensProducao,
  produtos,
  users,
  variacoesProduto,
  type Maquina,
  type User,
} from '@/lib/db/schema'
import type { MaquinaStatus } from '@/lib/producao/estado-maquina'
import { abreParada, type MotivoDeParada } from '@/lib/producao/parada-de-maquina'
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// -----------------------------------------------------------------
// A parada acompanha o status — sempre, por todos os caminhos
// -----------------------------------------------------------------
//
// ⚠️ TODO CAMINHO QUE ESCREVE `maquinas.status` PASSA POR AQUI. São três:
// o "Registrar parada" / "Voltou" do cartão e do tablet (`trocarStatusAction`),
// o formulário de cadastro (`atualizarMaquinaAction`, que tem um select com
// apta/setup/desativada) e a exclusão (`excluirMaquinaAction`, que grava 'desativada').
// Se um deles escrevesse o status por fora, a máquina apareceria "Livre" no
// cartão com uma parada correndo há dias no histórico — e o relatório de
// disponibilidade contaria horas que nunca existiram.
//
// A regra, em uma linha: EXISTE PARADA ABERTA SE E SOMENTE SE O STATUS
// IMPEDE PRODUZIR. `abreParada` deriva isso de `motivoDeImpedimento`, a mesma
// função que pinta o cartão — não há segunda lista pra sair de sincronia.
//
// ⚠️ RODA DENTRO DA TRANSAÇÃO da troca de status, e não depois. Se o INSERT
// da parada falhasse sozinho, a máquina ficaria impedida sem parada aberta:
// o cartão diria "Em manutenção", o histórico não teria nada, e a próxima
// liberação não teria o que fechar.
async function sincronizarParada(
  tx: Tx,
  p: {
    maquinaId: string
    statusAnterior: MaquinaStatus
    statusNovo: MaquinaStatus
    usuarioId: string
    motivo?: MotivoDeParada
    observacaoAbertura?: string
    observacaoFechamento?: string
  },
): Promise<void> {
  const impediaAntes = abreParada(p.statusAnterior)
  const impedeAgora = abreParada(p.statusNovo)

  // Nada mudou na disponibilidade: nem abre nem fecha. É o caso de re-clicar
  // no mesmo botão, e também o de trocar só o nome no cadastro.
  if (!impediaAntes && !impedeAgora) return
  if (impediaAntes && impedeAgora && p.statusAnterior === p.statusNovo) return

  // FECHA A ABERTA quando a máquina volta a produzir — e TAMBÉM quando passa
  // de um impedimento pro outro (manutenção -> desativada). O segundo caso
  // poderia deixar a mesma linha aberta, mas aí o histórico diria "em
  // manutenção por 3 dias" um período em que a máquina estava desativada. Em
  // segmentos consecutivos, ele conta o que de fato aconteceu.
  if (impediaAntes) {
    await tx
      .update(maquinaParadas)
      .set({
        encerradaEm: new Date(),
        encerradaPor: p.usuarioId,
        observacaoFechamento: p.observacaoFechamento ?? null,
      })
      .where(
        and(
          eq(maquinaParadas.maquinaId, p.maquinaId),
          isNull(maquinaParadas.encerradaEm),
        ),
      )
  }

  if (!impedeAgora) return

  // A OP que estava rodando na hora. SNAPSHOT: depois ela pode ser concluída
  // ou movida, e "o que estava preso aqui quando parou" tem uma resposta só.
  const [op] = await tx
    .select({ id: ordensProducao.id })
    .from(ordensProducao)
    .where(
      and(
        eq(ordensProducao.maquinaId, p.maquinaId),
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .limit(1)

  try {
    await tx.insert(maquinaParadas).values({
      maquinaId: p.maquinaId,
      status: p.statusNovo,
      motivo: p.motivo ?? null,
      observacaoAbertura: p.observacaoAbertura ?? null,
      abertaPor: p.usuarioId,
      ordemId: op?.id ?? null,
    })
  } catch (err) {
    // 23505 aqui só sai do índice `maquina_paradas_aberta_uidx`: alguém abriu
    // uma parada nesta máquina no mesmo instante, de outro tablet. O objetivo
    // — máquina parada COM parada registrada — já está cumprido, e derrubar a
    // troca de status por causa disso deixaria a máquina rodando na tela com
    // o operador achando que parou.
    if (!isUniqueViolation(err)) throw err
  }
}

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
  estacaoNome: string | null
  /**
   * A parada ABERTA, quando existe — é dela que sai o "há 2 h" no cartão.
   * Existe se e somente se o status impede produzir; quem garante isso é
   * `sincronizarParada`, e o índice parcial garante que é no máximo uma.
   */
  paradaAberta: {
    iniciadaEm: Date
    motivo: string | null
    /** O texto do "Outro" vira a manchete — ver `oQueParou`. */
    observacaoAbertura: string | null
  } | null
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
      estacaoNome: estacoes.nome,
      opId: ordensProducao.id,
      opNumero: ordensProducao.numero,
      opQuantidade: ordensProducao.quantidade,
      produtoNome: produtos.nome,
      variacaoCor: variacoesProduto.cor,
      variacaoModelo: variacoesProduto.modelo,
      variacaoTamanho: variacoesProduto.tamanho,
      responsavelNome: responsavel.nome,
      paradaIniciadaEm: maquinaParadas.iniciadaEm,
      paradaMotivo: maquinaParadas.motivo,
      paradaObservacao: maquinaParadas.observacaoAbertura,
    })
    .from(maquinas)
    // ⚠️ NÃO HÁ MAIS JOIN COM `operador_atual_id`. Ele existia pra exibir o
    // nome do "operador atual" da máquina — que em produção era, em três
    // máquinas, um usuário APAGADO. O campo saiu da tela e do schema de
    // escrita; a coluna fica por histórico (56_maquinas_rls_estacao.sql).
    // Quem aparece no cartão é o RESPONSÁVEL DA OP, que é outra pergunta.
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
    // A PARADA ABERTA, pra o cartão dizer HÁ QUANTO TEMPO. Não duplica a
    // linha da máquina pelo mesmo motivo do join da OP: o índice parcial
    // `maquina_paradas_aberta_uidx` garante no máximo uma aberta por máquina.
    .leftJoin(
      maquinaParadas,
      and(
        eq(maquinaParadas.maquinaId, maquinas.id),
        isNull(maquinaParadas.encerradaEm),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(maquinas.codigo))

  return rows.map((r) => ({
    ...r.m,
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

/**
 * SÓ O QUE A OCUPAÇÃO PRECISA: o status de cada máquina e se tem OP em
 * produção. É o cabeçalho do kanban, que recarrega a cada mudança de OP da
 * fábrica — `listarMaquinas` traria nome, estação, produto, variação,
 * responsável e parada de cada máquina pra jogar tudo fora e contar.
 *
 * ⚠️ O RECORTE DA OP É O MESMO DE `listarMaquinas`, cláusula por cláusula
 * (em_producao, não apagada, `deleted_at` da máquina nulo). A conta das duas
 * telas só bate porque as duas passam por `situacaoDaMaquina` com o mesmo
 * "tem OP"; mexeu num join, mexa no outro.
 */
export async function situacoesDasMaquinas(): Promise<
  { status: MaquinaListItem['status']; temOp: boolean }[]
> {
  await requireAuth()
  const rows = await db
    .select({ status: maquinas.status, opId: ordensProducao.id })
    .from(maquinas)
    .leftJoin(
      ordensProducao,
      and(
        eq(ordensProducao.maquinaId, maquinas.id),
        eq(ordensProducao.status, 'em_producao'),
        isNull(ordensProducao.deletedAt),
      ),
    )
    .where(isNull(maquinas.deletedAt))
  return rows.map((r) => ({ status: r.status, temOp: r.opId !== null }))
}

// -----------------------------------------------------------------
// Histórico de paradas de UMA máquina
// -----------------------------------------------------------------

export type ParadaDoHistorico = {
  id: string
  status: MaquinaStatus
  motivo: string | null
  observacaoAbertura: string | null
  iniciadaEm: Date
  abertaPorNome: string | null
  encerradaEm: Date | null
  encerradaPorNome: string | null
  observacaoFechamento: string | null
  opNumero: string | null
}

const abriu = alias(users, 'abriu_parada')
const fechou = alias(users, 'fechou_parada')

/**
 * A linha do tempo de paradas da máquina, da mais recente pra mais antiga.
 *
 * Leitura pura — mesma guarda do resto do arquivo (`requireAuth`), porque a
 * aba que mostra isto já passou por `requireArea('maquinas')`. É o mesmo
 * arranjo de `historicoDaOrdem`.
 *
 * ⚠️ TETO DE 50. O histórico de uma máquina de anos não cabe num Sheet nem
 * interessa inteiro: quem abre quer ver o que houve nos últimos dias. Sem
 * teto, a tela de uma máquina problemática iria ficando mais lenta em
 * silêncio até alguém reclamar.
 */
export async function historicoDeParadas(
  maquinaId: string,
): Promise<ParadaDoHistorico[]> {
  await requireAuth()

  const rows = await db
    .select({
      id: maquinaParadas.id,
      status: maquinaParadas.status,
      motivo: maquinaParadas.motivo,
      observacaoAbertura: maquinaParadas.observacaoAbertura,
      iniciadaEm: maquinaParadas.iniciadaEm,
      abertaPorNome: abriu.nome,
      encerradaEm: maquinaParadas.encerradaEm,
      encerradaPorNome: fechou.nome,
      observacaoFechamento: maquinaParadas.observacaoFechamento,
      opNumero: ordensProducao.numero,
    })
    .from(maquinaParadas)
    .leftJoin(abriu, eq(abriu.id, maquinaParadas.abertaPor))
    .leftJoin(fechou, eq(fechou.id, maquinaParadas.encerradaPor))
    // Sem `isNull(deletedAt)` na OP de propósito: o snapshot vale mesmo se a
    // OP foi excluída depois. "O que estava rodando quando parou" não muda.
    .leftJoin(ordensProducao, eq(ordensProducao.id, maquinaParadas.ordemId))
    .where(eq(maquinaParadas.maquinaId, maquinaId))
    .orderBy(desc(maquinaParadas.iniciadaEm))
    .limit(50)

  return rows
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

// ⚠️ MANUTENÇÃO NÃO ENTRA PELO CADASTRO. O formulário deixou de oferecer
// (STATUS_ESCOLHIVEIS), e sem isto a action continuaria aceitando — a tela
// prometeria uma coisa e o servidor entregaria outra. Manutenção é parada, e
// parada entra pelo cartão, com motivo. Quem JÁ está em manutenção salva o
// cadastro normalmente: o status não muda e nenhuma parada é tocada.
function recusaManutencaoPeloCadastro(
  statusAtual: MaquinaStatus | null,
  statusNovo: MaquinaStatus,
): { success: false; error: string } | null {
  if (statusNovo !== 'manutencao' || statusAtual === 'manutencao') return null
  return {
    success: false,
    error: 'Registre a parada pelo cartão da máquina, com o motivo',
  }
}

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
  const recusa = recusaManutencaoPeloCadastro(null, data.status)
  if (recusa) return recusa

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
  const user = await requireAreaEscrita('maquinas')

  const parsed = maquinaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // ⚠️ O STATUS ANTERIOR ENTRA NA CONSULTA, e não é detalhe: este formulário
  // tem um select com apta/setup/desativada, então editar o cadastro é
  // um dos caminhos que impedem e liberam a máquina. Sem saber de onde veio,
  // não dá pra abrir nem fechar a parada certa.
  const [atual] = await db
    .select({ id: maquinas.id, status: maquinas.status })
    .from(maquinas)
    .where(and(eq(maquinas.id, id), isNull(maquinas.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Máquina não encontrada' }
  }
  const recusa = recusaManutencaoPeloCadastro(atual.status, data.status)
  if (recusa) return recusa

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

  // `operadorAtualId` NÃO entra no `set`, e isso PRESERVA o que está lá.
  // Omitir a coluna é diferente de gravar null: as três máquinas que têm o
  // campo preenchido continuam tendo depois de qualquer edição.
  await db.transaction(async (tx) => {
    await tx
      .update(maquinas)
      .set({
        codigo: codigoUpper,
        nome: data.nome,
        status: data.status,
        observacoes: data.observacoes ?? null,
      })
      .where(eq(maquinas.id, id))

    // Sem motivo: o formulário de cadastro não tem diálogo de motivo, e é
    // por isso que `maquina_paradas.motivo` é nulável. Inventar um aqui
    // ("preventiva"?) seria pôr no histórico uma escolha que ninguém fez.
    await sincronizarParada(tx, {
      maquinaId: id,
      statusAnterior: atual.status,
      statusNovo: data.status,
      usuarioId: user.id,
    })
  })

  revalidatePath('/fabrica')
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
  // Tablet travado não grava — ver src/lib/auth/inatividade.ts.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado

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

  // O status e a parada mudam JUNTOS ou não mudam — ver `sincronizarParada`.
  await db.transaction(async (tx) => {
    await tx
      .update(maquinas)
      .set({
        status: data.status,
        observacoes: data.observacoes ?? atual.observacoes,
      })
      .where(eq(maquinas.id, id))

    await sincronizarParada(tx, {
      maquinaId: id,
      statusAnterior: atual.status,
      statusNovo: data.status,
      usuarioId: user.id,
      motivo: data.motivo,
      observacaoAbertura: data.observacaoAbertura,
      observacaoFechamento: data.observacaoFechamento,
    })
  })

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
  const user = await requireAreaEscrita('maquinas')

  const [atual] = await db
    .select({ id: maquinas.id, codigo: maquinas.codigo, status: maquinas.status })
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

  await db.transaction(async (tx) => {
    await tx
      .update(maquinas)
      .set({ deletedAt: new Date(), status: 'desativada', operadorAtualId: null })
      .where(eq(maquinas.id, id))

    // ⚠️ FECHA A PARADA ABERTA E NÃO ABRE OUTRA. A máquina saiu do chão de
    // fábrica; ela não "parou por 8 meses" só porque foi excluída. Sem isto,
    // toda máquina excluída durante uma manutenção ficaria com uma parada
    // aberta correndo pra sempre, e o histórico dela contaria um tempo de
    // parada que cresce sozinho.
    await tx
      .update(maquinaParadas)
      .set({ encerradaEm: new Date(), encerradaPor: user.id })
      .where(
        and(
          eq(maquinaParadas.maquinaId, id),
          isNull(maquinaParadas.encerradaEm),
        ),
      )
  })

  revalidatePath('/fabrica')
  revalidatePath('/maquinas')
  revalidatePath('/producao')
  return { success: true, message: 'Máquina excluída' }
}
