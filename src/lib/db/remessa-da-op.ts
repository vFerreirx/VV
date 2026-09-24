import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db'
import { contasMarketplace, remessasFull } from '@/lib/db/schema'
import { hojeEmBrasilia } from '@/lib/dia-brasil'
import {
  ehCanalFull,
  erroDaRemessaDaOp,
  prazoDaOp,
  producaoAteEfetivo,
} from '@/lib/producao/prazo-da-remessa'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * A REMESSA DE UMA OP NOVA DE FULL — escolhida entre as que ainda não saíram,
 * ou criada na hora com a conta e a data de envio.
 *
 * A regra do "Full só dentro de remessa, do mesmo canal" é `erroDaRemessaDaOp`
 * (src/lib/producao/prazo-da-remessa.ts); aqui é a parte que precisa do
 * banco: a remessa existe e não saiu, a conta é do canal e está ativa.
 */
export type RemessaDaNovaOp =
  | { remessaId: string }
  | { nova: { contaId: string; dataEnvio: string } }

type RemessaResolvida = {
  id: string
  canal: string
  dataEnvio: string
  producaoAte: string | null
}

export type RemessaValidada =
  | { tipo: 'nenhuma' }
  | { tipo: 'existente'; remessa: RemessaResolvida }
  | {
      tipo: 'nova'
      contaId: string
      canal: 'full_ml' | 'full_shopee'
      dataEnvio: string
    }

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dataRe = /^\d{4}-\d{2}-\d{2}$/

/**
 * Confere a escolha ANTES da transação. Devolve o erro pra action mostrar, ou
 * o que gravar. A remessa nova só é INSERIDA dentro da transação da OP
 * (`remessaDaTransacao`): OP recusada não deixa remessa vazia pra trás.
 */
export async function validarRemessaDaNovaOp(
  canal: string,
  escolha: RemessaDaNovaOp | undefined,
): Promise<{ erro: string } | { ok: RemessaValidada }> {
  if (!escolha) {
    const erro = erroDaRemessaDaOp(canal, null)
    return erro ? { erro } : { ok: { tipo: 'nenhuma' } }
  }

  if ('remessaId' in escolha) {
    if (!uuidRe.test(escolha.remessaId)) return { erro: 'Remessa inválida' }
    const [r] = await db
      .select({
        id: remessasFull.id,
        canal: remessasFull.canal,
        dataEnvio: remessasFull.dataEnvio,
        producaoAte: remessasFull.producaoAte,
      })
      .from(remessasFull)
      .where(and(eq(remessasFull.id, escolha.remessaId), isNull(remessasFull.deletedAt)))
      .limit(1)
    if (!r) return { erro: 'Remessa não encontrada. Atualize a tela.' }
    const erro = erroDaRemessaDaOp(canal, r)
    if (erro) return { erro }
    // A MESMA JANELA do "mudar destino": remessa cujo envio já passou não
    // recebe OP nova — o caminhão já saiu.
    if (r.dataEnvio < hojeEmBrasilia()) {
      return { erro: 'O envio dessa remessa já passou' }
    }
    return { ok: { tipo: 'existente', remessa: r } }
  }

  // Remessa nova: conta DO CANAL e ativa, data de envio de hoje em diante.
  if (!ehCanalFull(canal)) {
    return { erro: erroDaRemessaDaOp(canal, { canal }) ?? 'Remessa inválida' }
  }
  const { contaId, dataEnvio } = escolha.nova
  if (!uuidRe.test(contaId)) return { erro: 'Escolha a conta da remessa' }
  if (!dataRe.test(dataEnvio)) return { erro: 'Informe a data de envio' }
  if (dataEnvio < hojeEmBrasilia()) {
    return { erro: 'A data de envio não pode ser no passado' }
  }
  const [conta] = await db
    .select({ id: contasMarketplace.id })
    .from(contasMarketplace)
    .where(
      and(
        eq(contasMarketplace.id, contaId),
        eq(contasMarketplace.canal, canal as 'full_ml' | 'full_shopee'),
        eq(contasMarketplace.ativo, true),
        isNull(contasMarketplace.deletedAt),
      ),
    )
    .limit(1)
  if (!conta) return { erro: 'A conta não é desse canal (ou foi desativada)' }
  return {
    ok: {
      tipo: 'nova',
      contaId,
      canal: canal as 'full_ml' | 'full_shopee',
      dataEnvio,
    },
  }
}

/**
 * Dentro da transação da OP: a remessa que ela recebe (criando a nova, se for
 * o caso) e o PRAZO que ela herda — a mesma conta do "mudar destino":
 * `prazoDaOp(producaoAteEfetivo(remessa))`. Null quando a OP não é de Full.
 */
export async function remessaDaTransacao(
  tx: Tx,
  validada: RemessaValidada,
): Promise<{ remessaFullId: string; dataPrevistaFim: Date } | null> {
  if (validada.tipo === 'nenhuma') return null
  let remessa: RemessaResolvida
  if (validada.tipo === 'existente') {
    remessa = validada.remessa
  } else {
    const [r] = await tx
      .insert(remessasFull)
      .values({
        canal: validada.canal,
        dataEnvio: validada.dataEnvio,
        // Nulo = padrão (envio menos a folga), como nos outros cadastros.
        producaoAte: null,
        contaId: validada.contaId,
      })
      .returning({
        id: remessasFull.id,
        canal: remessasFull.canal,
        dataEnvio: remessasFull.dataEnvio,
        producaoAte: remessasFull.producaoAte,
      })
    remessa = r!
  }
  return {
    remessaFullId: remessa.id,
    dataPrevistaFim: prazoDaOp(producaoAteEfetivo(remessa)),
  }
}
