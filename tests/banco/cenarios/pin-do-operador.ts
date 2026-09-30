// O PIN DO OPERADOR (Q197–Q199), pelas actions de verdade.
//
//   a) o gerente define o PIN de um operador
//   b) o admin define o de outro
//   c) o mesmo PIN pra um terceiro é recusado: "já é de outro operador"
//   d) o operador não usa a action de definir
//   e) o operador troca o próprio PIN com o atual certo
//   f) com o atual errado, recusa e conta a tentativa
//   g) sem o atual, não troca
//   h) a troca de operador pelo PIN novo confere (a conferência, sem abrir
//      sessão de verdade: o Supabase está mockado pra lançar)
//   +  no autoatendimento, o PIN de um colega NÃO é recusado — a recusa
//      contaria a ele o PIN do colega
//   +  `algumHashAceita`, a regra do "repetido", sem banco
//
// Os operadores e os PINs só existem dentro da transação desfeita: o retrato
// do fim confere que nenhum `pin_hash` do banco mudou.

import { and, asc, eq, isNull } from 'drizzle-orm'

import type { AuthUser } from '@/lib/auth/get-user'
import { users, type User } from '@/lib/db/schema'

import type { Cenario, Contexto } from '../lib/contexto'

export const pinDoOperador: Cenario = {
  nome: 'pin-do-operador',
  rodar,
}

// Nenhum da lista de fáceis (src/lib/auth/pin.ts).
const P1 = '2580'
const P1_NOVO = '3691'
const P2 = '1470'
const P3 = '8024'
const OUTRO = '5173'

function comoAuth(u: User): AuthUser {
  return { ...u, authEmail: u.email }
}

async function rodar(ctx: Contexto) {
  const { placar: p, tx } = ctx
  const { estacoes: cadastro, login, pin, pinConferencia } = ctx.acoes

  const ativos = (role: User['role']) =>
    tx
      .select()
      .from(users)
      .where(and(eq(users.role, role), eq(users.ativo, true), isNull(users.deletedAt)))
      .orderBy(asc(users.nome))
  const [operadores, gerentes, admins] = await Promise.all([
    ativos('operador'),
    ativos('gerente_producao'),
    ativos('admin'),
  ])
  if (operadores.length < 3 || gerentes.length === 0 || admins.length === 0) {
    p.pular(
      'o roteiro inteiro',
      `precisa de 3 operadores, 1 gerente e 1 admin ativos (tem ${operadores.length}, ${gerentes.length}, ${admins.length})`,
    )
    return
  }
  const [op1, op2, op3] = operadores
  const gerente = comoAuth(gerentes[0])
  const admin = comoAuth(admins[0])
  console.log(
    `  elenco: ${op1.nome}, ${op2.nome} e ${op3.nome} · gerente ${gerente.nome} · admin ${admin.nome}`,
  )

  const ler = async (id: string) => {
    const [u] = await tx
      .select({
        id: users.id,
        nome: users.nome,
        pinHash: users.pinHash,
        pinTentativas: users.pinTentativas,
        pinBloqueadoAte: users.pinBloqueadoAte,
      })
      .from(users)
      .where(eq(users.id, id))
    return u
  }

  // ------------------------------------------ a) gerente define
  ctx.como(gerente)
  let r = await cadastro.definirPinDoOperadorAction(op1.id, P1)
  let u = await ler(op1.id)
  p.exigir(
    `a) o gerente define o PIN de ${op1.nome}: "PIN de ${op1.nome} definido"`,
    r.success && r.message === `PIN de ${op1.nome} definido`,
    r,
  )
  p.checar(
    '  gravado como hash, que confere com o PIN; tentativas zeradas',
    u.pinHash !== null &&
      !u.pinHash.includes(P1) &&
      pin.conferirPin(P1, u.pinHash) &&
      u.pinTentativas === 0 &&
      u.pinBloqueadoAte === null,
  )
  p.checar(
    '  a resposta não traz o PIN',
    !JSON.stringify(r).includes(P1),
  )

  // ------------------------------------------- b) admin define
  ctx.como(admin)
  r = await cadastro.definirPinDoOperadorAction(op2.id, P2)
  u = await ler(op2.id)
  p.checar(
    `b) o admin define o PIN de ${op2.nome}`,
    r.success && pin.conferirPin(P2, u.pinHash),
    r,
  )

  // ---------------------------------------- c) PIN repetido
  const antesDo3 = (await ler(op3.id)).pinHash
  r = await cadastro.definirPinDoOperadorAction(op3.id, P1)
  p.checar(
    `c) o PIN de ${op1.nome} pra ${op3.nome}: recusado, e nada muda`,
    !r.success &&
      r.error === 'Esse PIN já é de outro operador. Escolha outro.' &&
      (await ler(op3.id)).pinHash === antesDo3,
    r,
  )
  r = await cadastro.definirPinDoOperadorAction(op1.id, P1)
  p.checar(
    `  redefinir o de ${op1.nome} pro mesmo valor não é "de outro operador"`,
    r.success,
    r,
  )

  // ------------------------------------- d) operador não define
  ctx.como(comoAuth(op3))
  r = await cadastro.definirPinDoOperadorAction(op3.id, P3)
  p.checar(
    'd) o operador não usa a action de definir',
    !r.success &&
      r.error === 'Sem permissão pra definir o PIN' &&
      (await ler(op3.id)).pinHash === antesDo3,
    r,
  )

  // ------------------------- e) troca o próprio com o atual certo
  ctx.como(comoAuth(op1))
  r = await login.definirMeuPinAction(P1_NOVO, P1)
  u = await ler(op1.id)
  p.exigir(
    `e) ${op1.nome} troca o próprio PIN, com o atual certo`,
    r.success && pin.conferirPin(P1_NOVO, u.pinHash) && !pin.conferirPin(P1, u.pinHash),
    r,
  )

  // ------------------------------ f) atual errado conta tentativa
  r = await login.definirMeuPinAction(OUTRO, P2)
  u = await ler(op1.id)
  p.checar(
    'f) com o atual errado: "PIN atual incorreto", a tentativa conta, e o PIN não muda',
    !r.success &&
      r.error === 'PIN atual incorreto' &&
      u.pinTentativas === 1 &&
      pin.conferirPin(P1_NOVO, u.pinHash),
    { r, tentativas: u.pinTentativas },
  )

  // ------------------------------------------- g) sem o atual
  r = await login.definirMeuPinAction(OUTRO)
  u = await ler(op1.id)
  p.checar(
    'g) sem o atual: "Digite seu PIN atual", e o PIN não muda',
    !r.success && r.error === 'Digite seu PIN atual' && pin.conferirPin(P1_NOVO, u.pinHash),
    r,
  )

  // ------------------------------ h) a troca pelo PIN novo confere
  // O mesmo `conferirPinComContador` que a `trocarOperadorAction` chama —
  // aqui, sem abrir sessão (o Supabase do teste lança se alguém chamar).
  const errado = await pinConferencia.conferirPinComContador(await ler(op1.id), P1)
  const certo = await pinConferencia.conferirPinComContador(await ler(op1.id), P1_NOVO)
  u = await ler(op1.id)
  p.checar(
    `h) trocar pra ${op1.nome}: o PIN velho não entra, o novo entra e zera o contador`,
    errado === 'PIN incorreto' && certo === null && u.pinTentativas === 0,
    { errado, certo, tentativas: u.pinTentativas },
  )

  // --------------------- + o autoatendimento não entrega o colega
  ctx.como(comoAuth(op3))
  const semPin = (await ler(op3.id)).pinHash === null
  r = await login.definirMeuPinAction(P2, semPin ? null : undefined)
  p.checar(
    `+ ${op3.nome} cria o próprio PIN igual ao de ${op2.nome}: aceito, sem dizer nada`,
    semPin ? r.success : !r.success,
    semPin ? r : `${op3.nome} já tinha PIN no banco; o passo exige o atual`,
  )

  // ------------------------------------ + a regra, sem banco
  const hashes = [pin.gerarHashDePin(P1), null, pin.gerarHashDePin(P2)]
  p.checar(
    '+ algumHashAceita: acha o PIN em qualquer posição, e não inventa',
    pin.algumHashAceita(P2, hashes) &&
      pin.algumHashAceita(P1, hashes) &&
      !pin.algumHashAceita(OUTRO, hashes) &&
      !pin.algumHashAceita(P1, []),
  )
}
