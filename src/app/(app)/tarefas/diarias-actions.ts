'use server'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { tarefasDiarias, users, vendas, type TarefaDiaria } from '@/lib/db/schema'
import { diaDaSemana, ehDoDia, hojeEmBrasilia, somarDias } from '@/lib/dia-brasil'
import {
  ehDiariaAutomatica,
  tarefaDiariaSchema,
  type TarefaDiariaInput,
} from '@/lib/validators/tarefas'

// Tarefas DIÁRIAS — rotinas que voltam pendentes todo dia. Admin-only via
// requireRole, igual às tarefas normais: a área `tarefas` não é editável em
// /permissoes, então as duas camadas dizem a mesma coisa.
//
// ESTE ARQUIVO NÃO ENCOSTA NO ALERTA NEM NO PAINEL. Diária não acende a
// bolinha do menu (`alertaDeTarefas`) e não entra no dashboard — por isso
// nenhuma action daqui revalida `/dashboard`, e é essa ausência que prova a
// decisão em código. Se um dia aparecer um revalidate do dashboard aqui, ou
// é engano ou a regra mudou.

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

export type DiariaComContexto = TarefaDiaria & {
  // Quem marcou. São vários admins — a pergunta do dia é "alguém já fez?".
  concluidaPorNome: string | null

  // Hoje é um dos dias da semana da rotina? Calculado AQUI, no servidor,
  // com o mesmo `hoje` de todo o resto da requisição. Deixar a tela chamar
  // `new Date()` por conta própria faria o navegador e o servidor
  // discordarem à noite — que é exatamente o bug que dia-brasil.ts existe
  // pra matar.
  valeHoje: boolean
  // `concluidaEm` caiu no dia de HOJE em Brasília? Não é coluna: virou o
  // dia, a diária volta pendente sozinha. Conclusão de ontem simplesmente
  // deixa de contar — não vira dívida, não aparece como atrasada.
  //
  // ⚠️ NA DIÁRIA AUTOMÁTICA ISTO NÃO SAI DE `concluidaEm`: sai do fato que a
  // automação observa. Em "Cadastrar vendas do dia anterior", sai de existir
  // lançamento em `vendas` pra ontem — ver `listarDiarias`.
  feitaHoje: boolean
}

export type ListaDiarias = {
  // TODAS as não-excluídas, inclusive as que não valem hoje: a tela precisa
  // delas pra seção "Todas as diárias", senão uma rotina de segunda vira
  // ingerenciável no domingo.
  diarias: DiariaComContexto[]
  // O dia da casa, pra tela dizer de qual dia está falando sem recalcular
  // nada por conta própria.
  hoje: string
  diaSemana: number
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CAMPOS = {
  id: tarefasDiarias.id,
  titulo: tarefasDiarias.titulo,
  descricao: tarefasDiarias.descricao,
  diasSemana: tarefasDiarias.diasSemana,
  automatica: tarefasDiarias.automatica,
  concluidaEm: tarefasDiarias.concluidaEm,
  concluidaPor: tarefasDiarias.concluidaPor,
  criadoPor: tarefasDiarias.criadoPor,
  createdAt: tarefasDiarias.createdAt,
  updatedAt: tarefasDiarias.updatedAt,
  deletedAt: tarefasDiarias.deletedAt,
  concluidaPorNome: users.nome,
}

// -----------------------------------------------------------------
// Listagem
// -----------------------------------------------------------------

export async function listarDiarias(): Promise<ListaDiarias> {
  await requireRole(['admin'])

  // UM `hoje` por requisição — a mesma disciplina de `buscarPendentes()`.
  // Duas chamadas podem cair em dias diferentes se a requisição atravessar
  // a meia-noite, e aí a lista e o contador discordariam.
  const hoje = hojeEmBrasilia()
  const diaSemana = diaDaSemana(hoje)

  // Ordem de CADASTRO, e não alfabética: checklist de rotina se lê na ordem
  // em que foi montado, e uma lista que se reordena sozinha quando alguém
  // renomeia um item obriga a reler tudo todo dia.
  //
  // leftJoin em users: diária nunca feita não tem autor e precisa aparecer.
  const linhas = await db
    .select(CAMPOS)
    .from(tarefasDiarias)
    .leftJoin(users, eq(users.id, tarefasDiarias.concluidaPor))
    .where(isNull(tarefasDiarias.deletedAt))
    .orderBy(asc(tarefasDiarias.createdAt))

  // A DIÁRIA AUTOMÁTICA PERGUNTA AO FATO, não à marcação. UMA consulta no
  // total e só quando existe uma diária dessas na lista — nada de uma por
  // linha. Hoje a única fonte é "as vendas de ONTEM estão lançadas?".
  const temVendas = linhas.some((d) => d.automatica === 'vendas_do_dia_anterior')
  const vendasDeOntemLancadas = temVendas
    ? await diaTemVenda(somarDias(hoje, -1))
    : false

  const diarias = linhas.map(
    (d): DiariaComContexto => ({
      ...d,
      valeHoje: d.diasSemana.includes(diaSemana),
      feitaHoje:
        d.automatica === 'vendas_do_dia_anterior'
          ? vendasDeOntemLancadas
          : ehDoDia(d.concluidaEm, hoje),
    }),
  )

  return { diarias, hoje, diaSemana }
}

/** Existe lançamento de venda nesse dia? É a fonte da diária automática. */
async function diaTemVenda(dia: string): Promise<boolean> {
  const [linha] = await db
    .select({ id: vendas.id })
    .from(vendas)
    .where(and(eq(vendas.data, dia), isNull(vendas.deletedAt)))
    .limit(1)
  return linha !== undefined
}

// -----------------------------------------------------------------
// Criar / atualizar / excluir
// -----------------------------------------------------------------

export async function criarDiariaAction(
  input: TarefaDiariaInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole(['admin'])

  const parsed = tarefaDiariaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [inserted] = await db
    .insert(tarefasDiarias)
    .values({
      titulo: data.titulo,
      descricao: data.descricao,
      diasSemana: data.diasSemana,
      criadoPor: user.id,
    })
    .returning({ id: tarefasDiarias.id })

  revalidatePath('/tarefas')
  return {
    success: true,
    data: { id: inserted!.id },
    message: 'Diária criada',
  }
}

export async function atualizarDiariaAction(
  id: string,
  input: TarefaDiariaInput,
): Promise<ActionResult> {
  await requireRole(['admin'])

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const parsed = tarefaDiariaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: tarefasDiarias.id })
    .from(tarefasDiarias)
    .where(and(eq(tarefasDiarias.id, id), isNull(tarefasDiarias.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Diária não encontrada' }

  // A CONCLUSÃO NÃO É TOCADA AQUI. Editar o título de uma rotina já feita
  // hoje não pode desmarcá-la — quem fez, fez.
  await db
    .update(tarefasDiarias)
    .set({
      titulo: data.titulo,
      descricao: data.descricao,
      diasSemana: data.diasSemana,
    })
    .where(eq(tarefasDiarias.id, id))

  revalidatePath('/tarefas')
  return { success: true, message: 'Diária atualizada' }
}

// Marcar e desmarcar são a MESMA operação com sinal trocado: as duas
// colunas do estado andam juntas (o CHECK do banco não aceita metade).
//
// Marcar grava `now()`, um INSTANTE absoluto — não um "dia". Quem decide de
// que dia ele é, na leitura, é `dia-brasil.ts`. Gravar a data já resolvida
// aqui reintroduziria o fuso do servidor no banco, que é o bug original.
async function definirConclusao(
  id: string,
  quem: string | null,
): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await db
    .select({
      id: tarefasDiarias.id,
      diasSemana: tarefasDiarias.diasSemana,
      automatica: tarefasDiarias.automatica,
    })
    .from(tarefasDiarias)
    .where(and(eq(tarefasDiarias.id, id), isNull(tarefasDiarias.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Diária não encontrada' }

  // ⚠️ A TELA PODE MENTIR, A ACTION NÃO. Diária automática não se marca nem
  // se desmarca: a resposta dela vem do fato observado, e uma marcação à mão
  // criaria a segunda verdade que a automação existe pra evitar. Vale pro
  // checkbox da lista E pro botão da janelinha (tarefa-pip.tsx), que chamam
  // esta mesma função.
  if (ehDiariaAutomatica(atual.automatica)) {
    return {
      success: false,
      error:
        'Essa rotina é automática: ela se marca sozinha quando o lançamento existe.',
    }
  }

  // Só dá pra marcar o que vale HOJE. A tela já não mostra caixa nas
  // outras, mas uma aba aberta desde ontem chamaria esta action com a regra
  // de ontem — e "feita" numa rotina de terça, marcada num domingo, não
  // quer dizer nada. Desmarcar (`quem === null`) escapa da trava de
  // propósito: limpar estado ruim tem que ser sempre possível.
  const hojeDaSemana = diaDaSemana(hojeEmBrasilia())
  if (quem !== null && !atual.diasSemana.includes(hojeDaSemana)) {
    return { success: false, error: 'Essa diária não vale para hoje' }
  }

  await db
    .update(tarefasDiarias)
    .set({
      concluidaEm: quem === null ? null : new Date(),
      concluidaPor: quem,
    })
    .where(eq(tarefasDiarias.id, id))

  revalidatePath('/tarefas')
  return {
    success: true,
    message: quem === null ? 'Diária desmarcada' : 'Diária feita',
  }
}

export async function concluirDiariaAction(id: string): Promise<ActionResult> {
  const user = await requireRole(['admin'])
  return definirConclusao(id, user.id)
}

export async function reabrirDiariaAction(id: string): Promise<ActionResult> {
  await requireRole(['admin'])
  return definirConclusao(id, null)
}

// Soft delete — vai pra lixeira e dá pra restaurar de lá, igual à tarefa
// normal (ver src/app/(app)/lixeira/actions.ts, tipo 'diaria').
export async function excluirDiariaAction(id: string): Promise<ActionResult> {
  await requireRole(['admin'])

  if (!UUID_RE.test(id)) return { success: false, error: 'ID inválido' }

  const [atual] = await db
    .select({ id: tarefasDiarias.id })
    .from(tarefasDiarias)
    .where(and(eq(tarefasDiarias.id, id), isNull(tarefasDiarias.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Diária não encontrada' }

  await db
    .update(tarefasDiarias)
    .set({ deletedAt: new Date() })
    .where(eq(tarefasDiarias.id, id))

  revalidatePath('/tarefas')
  revalidatePath('/lixeira')
  return { success: true, message: 'Diária excluída' }
}
