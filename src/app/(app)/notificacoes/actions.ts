'use server'

import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'

import { requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { maquinas, ordensProducao, produtos } from '@/lib/db/schema'

// Notificações derivadas do estado atual (sem tabela persistente).
// Quando o assunto é resolvido (OP enviada, manutenção registrada),
// o alerta some sozinho.

export type Notificacao = {
  id: string
  tipo: 'op_atrasada' | 'manutencao_vencida'
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
  await requireAuth()
  const now = Date.now()

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
      ),
    )
    .orderBy(asc(ordensProducao.dataPrevistaFim))
    .limit(50)

  // 2) Máquinas com manutenção vencida (proximaManutencao < now e não excluída)
  const manutVencidas = await db
    .select({
      id: maquinas.id,
      codigo: maquinas.codigo,
      nome: maquinas.nome,
      proximaManutencao: maquinas.proximaManutencao,
    })
    .from(maquinas)
    .where(
      and(
        isNull(maquinas.deletedAt),
        isNotNull(maquinas.proximaManutencao),
        sql`${maquinas.proximaManutencao} < now()`,
      ),
    )
    .orderBy(asc(maquinas.proximaManutencao))
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

  for (const m of manutVencidas) {
    const data = new Date(m.proximaManutencao!)
    const diasAtraso = Math.floor((now - data.getTime()) / DIAS)
    notificacoes.push({
      id: `maq-${m.id}`,
      tipo: 'manutencao_vencida',
      titulo: `Manutenção ${m.codigo} vencida`,
      descricao:
        diasAtraso === 0
          ? `${m.nome} — vence hoje`
          : `${m.nome} — ${diasAtraso} dia${diasAtraso === 1 ? '' : 's'} sem manutenção`,
      href: `/maquinas/${m.id}`,
      severidade: diasAtraso >= 7 ? 'critico' : 'aviso',
      referenciaEm: data,
    })
  }

  // Ordena por mais atrasado primeiro
  notificacoes.sort(
    (a, b) => a.referenciaEm.getTime() - b.referenciaEm.getTime(),
  )

  return notificacoes
}
