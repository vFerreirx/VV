'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

import { and, asc, eq, isNull } from 'drizzle-orm'

import { getCurrentUser } from '@/lib/auth/get-user'
import {
  COOKIE_ATIVIDADE,
  COOKIE_OPERADOR,
  COOKIE_TRAVADO,
} from '@/lib/auth/inatividade'
import { recusaSeTabletTravado } from '@/lib/auth/tablet-travado'
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
import { destinoInicial } from '@/lib/auth/permissoes-db'

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

  // Sem destino pedido, cada cargo cai na SUA casa — ver casaAcessivel.
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

  redirect(await destinoInicial(perfil?.role))
}

// O cookie que diz ao proxy "esta sessão é de tablet de estação". Existe pra
// que a checagem de inatividade não precise consultar o banco a cada
// request — e pra que ela NÃO alcance admin e gerente, que trabalham no
// desktop e não podem ser derrubados por meia hora lendo um relatório.
//
// ⚠️ E É O ÚNICO LUGAR QUE APAGA A TRAVA (`vv_travado`). Todo caminho que
// prova quem está no tablet passa por aqui — login por senha, troca de
// operador por PIN, confirmação do próprio PIN —, e só esses destravam. Ver
// src/lib/auth/inatividade.ts.
async function marcarSessaoDeOperador(ehOperador: boolean) {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_TRAVADO)
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
  // Nasce com o toque de agora — o login É um toque. `Date.now()` do
  // SERVIDOR, que é o relógio em que o cookie é sempre escrito e lido.
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
  // ⚠️ SEM ESTA GUARDA, QUEM PEGA O TABLET TRAVADO CRIA O PIN NA CONTA DE QUEM
  // SAIU — e depois entra como ele quando quiser. "Só o próprio" só vale se
  // quem está tocando for mesmo o próprio.
  const travado = await recusaSeTabletTravado()
  if (travado) return travado

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

// A CONFERÊNCIA DO PIN, com o contador de tentativas. Compartilhada entre a
// troca de operador e a confirmação do próprio PIN no tablet travado: são a
// mesma porta vista de dois lados, e um contador em cada uma dobraria as
// tentativas que alguém tem antes do bloqueio.
//
// Devolve a frase de recusa, ou null quando o PIN confere (e aí o contador já
// foi zerado).
async function conferirPinComContador(alvo: {
  id: string
  nome: string
  pinHash: string | null
  pinTentativas: number
  pinBloqueadoAte: Date | null
}, pin: string): Promise<string | null> {
  if (alvo.pinBloqueadoAte && alvo.pinBloqueadoAte > new Date()) {
    return 'Muitas tentativas erradas. Espere alguns segundos e tente de novo.'
  }
  if (!alvo.pinHash) {
    return `${alvo.nome} ainda não criou um PIN. Entre pela senha.`
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

    return bloquear
      ? `Muitas tentativas. Espere ${SEGUNDOS_DE_BLOQUEIO} segundos e tente de novo.`
      : 'PIN incorreto'
  }

  // Acertou: zera o contador.
  await db
    .update(users)
    .set({ pinTentativas: 0, pinBloqueadoAte: null })
    .where(eq(users.id, alvo.id))
  return null
}

/**
 * "Sou eu" no tablet travado: confere o PIN de QUEM JÁ ESTÁ LOGADO e
 * destrava, sem trocar de sessão.
 *
 * ⚠️ NÃO É PORTA NOVA. Exige sessão de operador ativa, e o único PIN que
 * confere é o do próprio usuário da sessão — o mesmo par de condições da troca
 * logo abaixo. Destravar não dá nada que a sessão já não tivesse: só prova que
 * quem está tocando é o dono dela.
 */
export async function confirmarMeuPinAction(
  pin: string,
): Promise<ActionResult> {
  const atual = await getCurrentUser()
  if (!atual || atual.role !== 'operador') {
    return { success: false, error: 'Sessão expirada — entre de novo' }
  }

  const [eu] = await db
    .select({
      id: users.id,
      nome: users.nome,
      pinHash: users.pinHash,
      pinTentativas: users.pinTentativas,
      pinBloqueadoAte: users.pinBloqueadoAte,
    })
    .from(users)
    .where(
      and(
        eq(users.id, atual.id),
        isNull(users.deletedAt),
        eq(users.ativo, true),
      ),
    )
    .limit(1)
  if (!eu) return { success: false, error: 'Sessão expirada — entre de novo' }

  const erro = await conferirPinComContador(eu, pin)
  if (erro) return { success: false, error: erro }

  // Destrava e recomeça o relógio: apaga `vv_travado` e grava a atividade
  // de agora, no relógio do servidor.
  await marcarSessaoDeOperador(true)
  return { success: true }
}

export async function trocarOperadorAction(
  operadorId: string,
  pin: string,
  // `seguirNaTela`: devolve sucesso em vez de redirecionar. É o caminho do
  // tablet travado, onde a troca acontece NO MEIO de uma ação ("Iniciar" já
  // foi tocado) e a ação tem que seguir com a sessão nova. O botão "Trocar
  // operador" continua redirecionando.
  opcoes: { seguirNaTela?: boolean } = {},
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

  const erroDoPin = await conferirPinComContador(alvo, pin)
  if (erroDoPin) return { success: false, error: erroDoPin }

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
  // herdaria os minutos parados de quem acabou de sair. E a trava sai junto.
  await marcarSessaoDeOperador(true)

  if (opcoes.seguirNaTela) return { success: true }
  redirect('/producao')
}
