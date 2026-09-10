'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { and, asc, eq, isNull } from 'drizzle-orm'

import { getCurrentUser } from '@/lib/auth/get-user'
import { COOKIE_ATIVIDADE, COOKIE_OPERADOR } from '@/lib/auth/inatividade'
import {
  conferirPin,
  erroDePin,
  gerarHashDePin,
  SEGUNDOS_DE_BLOQUEIO,
  TENTATIVAS_ATE_BLOQUEIO,
} from '@/lib/auth/pin'
import { db } from '@/lib/db'
import { estacaoDoOperador } from '@/lib/db/estacao-operadores'
import { estacaoOperadores, users } from '@/lib/db/schema'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  loginSchema,
  usernameToInternalEmail,
  type LoginInput,
} from '@/lib/validators/auth'
import { createClient } from '@/lib/supabase/server'
import { rotaInicial } from '@/lib/auth/rota-inicial'

export type ActionResult = { success: true } | { success: false; error: string }

export async function loginAction(
  input: LoginInput,
  next?: string,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Usuário ou senha inválidos' }
  }

  const supabase = await createClient()

  // O Supabase Auth usa email internamente — montamos a partir do username
  // que o usuário digitou. Isso é detalhe de implementação, o usuário só
  // conhece o "usuário".
  const internalEmail = usernameToInternalEmail(parsed.data.usuario)

  const { data, error } = await supabase.auth.signInWithPassword({
    email: internalEmail,
    password: parsed.data.senha,
  })

  if (error) {
    return { success: false, error: 'Usuário ou senha incorretos' }
  }

  if (next && next.startsWith('/')) redirect(next)

  // Sem destino pedido, cada cargo cai na SUA casa — ver rotaInicial.
  //
  // O cargo sai da tabela pelo id que o próprio login acabou de devolver, e
  // não de `getCurrentUser()`: aquele monta OUTRO cliente Supabase e releria
  // o cookie de sessão que esta mesma requisição acabou de escrever. Funciona,
  // mas depende de uma ordem que não está escrita em lugar nenhum — e falharia
  // em silêncio, mandando o operador pro dashboard sem erro nenhum. O id já
  // está na mão; ler direto não tem como dar meio-certo.
  const [perfil] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, data.user.id))
    .limit(1)

  await marcarSessaoDeOperador(perfil?.role === 'operador')

  redirect(rotaInicial(perfil?.role))
}

// O cookie que diz ao proxy "esta sessão é de tablet de estação". Existe pra
// que a checagem de inatividade não precise consultar o banco a cada
// request — e pra que ela NÃO alcance admin e gerente, que trabalham no
// desktop e não podem ser derrubados por meia hora lendo um relatório.
async function marcarSessaoDeOperador(ehOperador: boolean) {
  const cookieStore = await cookies()
  if (!ehOperador) {
    cookieStore.delete(COOKIE_OPERADOR)
    cookieStore.delete(COOKIE_ATIVIDADE)
    return
  }
  cookieStore.set(COOKIE_OPERADOR, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  // Nasce com o toque de agora — o login É um toque.
  cookieStore.set(COOKIE_ATIVIDADE, String(Date.now()), {
    // NÃO httpOnly: o cliente precisa escrever a cada toque. Ver
    // src/lib/auth/inatividade.ts.
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  })
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  await marcarSessaoDeOperador(false)
  redirect('/login')
}

// -----------------------------------------------------------------
// TROCA DE OPERADOR NO TABLET DA ESTAÇÃO
// -----------------------------------------------------------------
//
// O tablet é compartilhado, e trocar de conta custava: abrir a sidebar,
// rolar até o fim, Sair, digitar usuário e senha alfanumérica com o dedo
// sujo de fiapo. Uma troca que dá trabalho é uma troca que ninguém faz — e
// aí o operador da noite registra a produção no nome do operador do dia,
// que é o problema de autoria que a tela inteira existe pra resolver.
//
// ⚠️ O PIN NÃO AFROUXA A SESSÃO. Depois de conferido, o servidor emite uma
// sessão SUPABASE DE VERDADE pro operador escolhido (admin.generateLink +
// verifyOtp). Daí em diante é o mesmo cookie, as mesmas permissões e a mesma
// autoria: nenhuma action muda, e selecionar um nome continua não bastando
// pra agir como outra pessoa. A senha completa continua valendo e nunca é
// bloqueada pelo contador de tentativas do PIN.
//
// ⚠️ E NÃO É UMA PORTA NOVA NO /LOGIN. As duas actions exigem uma sessão de
// OPERADOR já ativa, e só oferecem/aceitam operadores DA MESMA ESTAÇÃO. Sem
// isso, um endpoint 'use server' que troca de identidade mediante 4 dígitos
// seria alcançável por qualquer um, pra qualquer conta da fábrica.

export type OperadorParaTroca = {
  id: string
  nome: string
  /** Só o booleano. O hash nunca sai daqui. */
  temPin: boolean
}

export async function listarOperadoresParaTroca(): Promise<
  OperadorParaTroca[]
> {
  const atual = await getCurrentUser()
  if (!atual || atual.role !== 'operador') return []

  const estacao = await estacaoDoOperador(atual.id)
  if (!estacao) return []

  const rows = await db
    .select({ id: users.id, nome: users.nome, pinHash: users.pinHash })
    .from(estacaoOperadores)
    .innerJoin(users, eq(users.id, estacaoOperadores.operadorId))
    .where(
      and(
        eq(estacaoOperadores.estacaoId, estacao.id),
        isNull(users.deletedAt),
        eq(users.ativo, true),
      ),
    )
    .orderBy(asc(users.nome))

  // O map descarta o hash ANTES de sair da função — o tipo de retorno já
  // proíbe, mas o `select` acima é o único lugar do app que lê a coluna, e
  // deixar isso explícito é mais barato que descobrir num vazamento.
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    temPin: r.pinHash !== null,
  }))
}

/** O operador define o PRÓPRIO PIN. Não dá privilégio nenhum: ele já está
 *  autenticado como ele mesmo, e o PIN só encurta um caminho que ele já tem.
 *  Trocar o PIN de OUTRA pessoa não é possível por aqui, de propósito. */
export async function definirMeuPinAction(pin: string): Promise<ActionResult> {
  const atual = await getCurrentUser()
  if (!atual) return { success: false, error: 'Sessão expirada' }
  if (atual.role !== 'operador') {
    return { success: false, error: 'PIN é só pra operador' }
  }

  const erro = erroDePin(pin)
  if (erro) return { success: false, error: erro }

  await db
    .update(users)
    .set({
      pinHash: gerarHashDePin(pin),
      pinTentativas: 0,
      pinBloqueadoAte: null,
    })
    .where(eq(users.id, atual.id))

  revalidatePath('/producao')
  return { success: true }
}

export async function trocarOperadorAction(
  operadorId: string,
  pin: string,
): Promise<ActionResult> {
  const atual = await getCurrentUser()
  if (!atual || atual.role !== 'operador') {
    return { success: false, error: 'Sessão expirada — entre de novo' }
  }

  const estacao = await estacaoDoOperador(atual.id)
  if (!estacao) {
    return { success: false, error: 'Você não está em nenhuma estação' }
  }

  // O ALVO PRECISA SER DA MESMA ESTAÇÃO, e a consulta é que garante — não um
  // `if` sobre uma lista que veio do cliente.
  const [alvo] = await db
    .select({
      id: users.id,
      nome: users.nome,
      email: users.email,
      role: users.role,
      pinHash: users.pinHash,
      pinTentativas: users.pinTentativas,
      pinBloqueadoAte: users.pinBloqueadoAte,
    })
    .from(estacaoOperadores)
    .innerJoin(users, eq(users.id, estacaoOperadores.operadorId))
    .where(
      and(
        eq(estacaoOperadores.estacaoId, estacao.id),
        eq(users.id, operadorId),
        isNull(users.deletedAt),
        eq(users.ativo, true),
        eq(users.role, 'operador'),
      ),
    )
    .limit(1)
  if (!alvo) return { success: false, error: 'Operador não é desta estação' }

  if (alvo.pinBloqueadoAte && alvo.pinBloqueadoAte > new Date()) {
    return {
      success: false,
      error: `Muitas tentativas erradas. Espere alguns segundos e tente de novo.`,
    }
  }
  if (!alvo.pinHash) {
    return {
      success: false,
      error: `${alvo.nome} ainda não criou um PIN. Entre pela senha.`,
    }
  }

  if (!conferirPin(pin, alvo.pinHash)) {
    // O CONTADOR SOBE ANTES DE RESPONDER. Com dez teclas e quatro casas, o
    // que segura a porta é isto, não o hash.
    const tentativas = alvo.pinTentativas + 1
    const bloquear = tentativas >= TENTATIVAS_ATE_BLOQUEIO
    await db
      .update(users)
      .set({
        pinTentativas: bloquear ? 0 : tentativas,
        pinBloqueadoAte: bloquear
          ? new Date(Date.now() + SEGUNDOS_DE_BLOQUEIO * 1000)
          : alvo.pinBloqueadoAte,
      })
      .where(eq(users.id, alvo.id))

    return {
      success: false,
      error: bloquear
        ? `Muitas tentativas. Espere ${SEGUNDOS_DE_BLOQUEIO} segundos e tente de novo.`
        : 'PIN incorreto',
    }
  }

  // Acertou: zera o contador antes de trocar de sessão.
  await db
    .update(users)
    .set({ pinTentativas: 0, pinBloqueadoAte: null })
    .where(eq(users.id, alvo.id))

  // A SESSÃO NOVA. `generateLink` NÃO envia e-mail — só devolve o token —, e
  // o `verifyOtp` roda no cliente de servidor, que escreve os cookies da
  // resposta. É o mesmo par de cookies que o login por senha produz.
  const admin = createAdminClient()
  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: alvo.email,
  })
  if (erroLink || !link.properties?.hashed_token) {
    return { success: false, error: 'Não consegui trocar de operador agora' }
  }

  const supabase = await createClient()
  // Derruba a sessão anterior antes de abrir a nova: sem isto, um erro no
  // meio deixaria o operador que saiu ainda logado, que é o pior desfecho
  // possível pra uma tela cujo assunto é autoria.
  await supabase.auth.signOut()

  const { error: erroOtp } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  })
  if (erroOtp) {
    return { success: false, error: 'Não consegui trocar de operador agora' }
  }

  // O relógio de inatividade recomeça com o operador novo — senão ele
  // herdaria os minutos parados de quem acabou de sair.
  await marcarSessaoDeOperador(true)

  redirect('/producao')
}
