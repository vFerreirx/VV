import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { db } from '@/lib/db'
import { estacoes } from '@/lib/db/schema'

// A ESTAÇÃO DESTE APARELHO — gravada no próprio tablet, num cookie.
//
// A fábrica tem quatro tablets fixos, e cada um fica perto de um grupo de
// máquinas: esse grupo é a estação, e ela é do TABLET, não do operador (o
// porquê está em src/lib/producao/cobertura.ts). O gerente define uma vez em
// cada aparelho, em "Este aparelho" (/este-aparelho), e a tela do tablet abre
// nas máquinas dela.
//
// ⚠️ UM COOKIE SEPARADO DA SESSÃO DE LOGIN, de propósito. A sessão troca a
// cada "Quem é você?" e some no Sair; a estação do tablet tem que sobreviver
// às duas coisas — ela é do aparelho, e quem está logado nele muda o dia
// inteiro. Por isso nenhum caminho de login ou logout apaga este cookie.
//
// ⚠️ NÃO É PERMISSÃO. Qualquer operador age em qualquer máquina, de qualquer
// tablet; a estação só ORGANIZA a tela e decide quando perguntar "Você está
// cobrindo?". Quem mexe no cookie à mão só vê outra aba primeiro.
//
// Estação apagada, cookie sumido ou valor que não é uuid: vale como "sem
// estação", e o tablet mostra a faixa "chame o gerente". Nunca um erro.

export const COOKIE_ESTACAO_DO_APARELHO = 'vv_estacao_aparelho'

// 400 DIAS É O TETO DO NAVEGADOR (o Chrome corta qualquer `max-age` maior), e
// um tablet fica na parede por mais que isso. Então o prazo é RENOVADO a cada
// login, troca de operador e confirmação de PIN (`renovarEstacaoDoAparelho`):
// num tablet em uso ele nunca vence. Parado por mais de 400 dias, cai no "sem
// estação", que é o desfecho desenhado pra isso.
const MAX_AGE_S = 400 * 24 * 60 * 60

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EstacaoDoAparelho = { id: string; nome: string; cor: string | null }

/** A estação viva deste aparelho, ou null (tablet sem estação). */
export async function estacaoDoAparelho(): Promise<EstacaoDoAparelho | null> {
  const valor = (await cookies()).get(COOKIE_ESTACAO_DO_APARELHO)?.value
  if (!valor || !uuidRe.test(valor)) return null
  const [row] = await db
    .select({ id: estacoes.id, nome: estacoes.nome, cor: estacoes.cor })
    .from(estacoes)
    .where(and(eq(estacoes.id, valor), isNull(estacoes.deletedAt)))
    .limit(1)
  return row ?? null
}

function opcoes() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_S,
  }
}

/**
 * Grava (ou apaga, com null) a estação deste aparelho. SÓ em Server Function
 * — o Next não escreve cookie durante o render. Quem confere o cargo é quem
 * chama (`definirEstacaoDoAparelhoAction`).
 */
export async function gravarEstacaoDoAparelho(
  estacaoId: string | null,
): Promise<void> {
  const jar = await cookies()
  if (estacaoId === null) {
    jar.delete(COOKIE_ESTACAO_DO_APARELHO)
    return
  }
  jar.set(COOKIE_ESTACAO_DO_APARELHO, estacaoId, opcoes())
}

/**
 * Empurra o prazo do cookie pra 400 dias a partir de agora, se ele existir.
 * Não conta como definir: não muda o valor, e por isso não confere cargo.
 */
export async function renovarEstacaoDoAparelho(): Promise<void> {
  const jar = await cookies()
  const valor = jar.get(COOKIE_ESTACAO_DO_APARELHO)?.value
  if (valor) jar.set(COOKIE_ESTACAO_DO_APARELHO, valor, opcoes())
}
