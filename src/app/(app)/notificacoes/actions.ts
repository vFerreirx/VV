'use server'

import { and, asc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'

import { isManager, requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { ordensProducao, produtos } from '@/lib/db/schema'

// Notificações derivadas do estado atual (sem tabela persistente).
// Quando o assunto é resolvido (OP enviada), o alerta some sozinho.

export type Notificacao = {
  id: string
  tipo: 'op_atrasada'
  titulo: string
  descricao: string
  href: string
  // 'critico' quando passou de muito tempo, senão 'aviso'
  severidade: 'aviso' | 'critico'
  // Timestamp do evento (data prevista que foi ultrapassada)
  referenciaEm: Date
}

const DIAS = 24 * 60 * 60 * 1000

export async function listarNotificacoes(): Promise<Notificacao[]> {
  const user = await requireAuth()
  const now = Date.now()

  // Operador só é alertado de OPs livres ou que ele pegou; gerentes/admin
  // veem tudo (mesma regra de visibilidade do kanban).
  const visibilidade = isManager(user.role)
    ? undefined
    : or(
        isNull(ordensProducao.responsavelId),
        eq(ordensProducao.responsavelId, user.id),
      )

  // 1) OPs atrasadas (dataPrevistaFim < now e status diferente de enviado/cancelado)
  const opsAtrasadas = await db
    .select({
      id: ordensProducao.id,
      numero: ordensProducao.numero,
      dataPrevistaFim: ordensProducao.dataPrevistaFim,
      produtoNome: produtos.nome,
    })
    .from(ordensProducao)
    .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
    .where(
      and(
        isNull(ordensProducao.deletedAt),
        ne(ordensProducao.status, 'enviado'),
        ne(ordensProducao.status, 'cancelado'),
        isNotNull(ordensProducao.dataPrevistaFim),
        sql`${ordensProducao.dataPrevistaFim} < now()`,
        visibilidade,
      ),
    )
    .orderBy(asc(ordensProducao.dataPrevistaFim))
    .limit(50)

  const notificacoes: Notificacao[] = []

  for (const op of opsAtrasadas) {
    const data = new Date(op.dataPrevistaFim!)
    const diasAtraso = Math.floor((now - data.getTime()) / DIAS)
    notificacoes.push({
      id: `op-${op.id}`,
      tipo: 'op_atrasada',
      titulo: `${op.numero} atrasada`,
      descricao:
        diasAtraso === 0
          ? `${op.produtoNome} — venceu hoje`
          : `${op.produtoNome} — ${diasAtraso} dia${diasAtraso === 1 ? '' : 's'} de atraso`,
      href: `/ordens/${op.id}`,
      severidade: diasAtraso >= 3 ? 'critico' : 'aviso',
      referenciaEm: data,
    })
  }

  // Ordena por mais atrasado primeiro
  notificacoes.sort(
    (a, b) => a.referenciaEm.getTime() - b.referenciaEm.getTime(),
  )

  return notificacoes
}
