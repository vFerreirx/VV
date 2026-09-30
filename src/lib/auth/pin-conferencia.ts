import 'server-only'

import { eq } from 'drizzle-orm'

import {
  conferirPin,
  SEGUNDOS_DE_BLOQUEIO,
  TENTATIVAS_ATE_BLOQUEIO,
} from '@/lib/auth/pin'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

// A CONFERÊNCIA DO PIN, com o contador de tentativas. Um contador só pra
// todas as portas que pedem o PIN de alguém: a troca de operador, o "Sou eu"
// do tablet travado e a troca do próprio PIN (que pede o atual). São a mesma
// porta vista de lados diferentes, e um contador em cada uma multiplicaria as
// tentativas que alguém tem antes do bloqueio.
//
// ⚠️ FORA DE ARQUIVO 'use server', DE PROPÓSITO. Tudo que um arquivo
// 'use server' exporta vira endpoint público. Esta função recebe o ALVO
// inteiro, hash incluído, de quem a chama: exportada de lá, qualquer um
// mandaria um alvo inventado com um hash feito por ele e zeraria o contador e
// o bloqueio de qualquer conta. Aqui ela só é alcançável por código de
// servidor que já leu o alvo do banco.
//
// Devolve a frase de recusa, ou null quando o PIN confere (e aí o contador já
// foi zerado).
export async function conferirPinComContador(
  alvo: {
    id: string
    nome: string
    pinHash: string | null
    pinTentativas: number
    pinBloqueadoAte: Date | null
  },
  pin: string,
): Promise<string | null> {
  if (alvo.pinBloqueadoAte && alvo.pinBloqueadoAte > new Date()) {
    return 'Muitas tentativas erradas. Espere alguns segundos e tente de novo.'
  }
  if (!alvo.pinHash) {
    return `${alvo.nome} ainda não tem PIN. Entre pela senha, ou peça ao gerente pra definir um.`
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
