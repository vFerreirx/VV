'use server'

import { and, asc, desc, eq, ilike, isNull, ne, or } from 'drizzle-orm'

import { carregarOverrides } from '@/lib/auth/permissoes-db'
import { nivelEfetivo } from '@/lib/auth/permissoes'
import { requireAuth } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { cores, kits, ordensProducao, produtos } from '@/lib/db/schema'
import { STATUS_LABEL_CURTO } from '@/lib/validators/ordens'

// Busca global do topbar: produtos, OPs, kits e cores num resultado só.
// Cada tipo só entra se o cargo tem acesso à área correspondente.

export type ResultadoBusca = {
  tipo: 'produto' | 'op' | 'kit' | 'cor'
  id: string
  titulo: string
  subtitulo: string
  href: string
  inativo?: boolean
}

const LIMITE_POR_TIPO = 5

export async function buscarGlobal(q: string): Promise<ResultadoBusca[]> {
  const user = await requireAuth()
  const termo = q.trim()
  if (termo.length < 1) return []
  const like = `%${termo}%`

  const overrides = await carregarOverrides()
  const temArea = (area: Parameters<typeof nivelEfetivo>[1]) =>
    nivelEfetivo(user.role, area, overrides) !== 'nenhum'

  const [prods, ops, kitsRows, coresRows] = await Promise.all([
    temArea('produtos')
      ? db
          .select({
            id: produtos.id,
            sku: produtos.sku,
            nome: produtos.nome,
            ativo: produtos.ativo,
          })
          .from(produtos)
          .where(
            and(
              isNull(produtos.deletedAt),
              or(ilike(produtos.sku, like), ilike(produtos.nome, like)),
            ),
          )
          .orderBy(desc(produtos.ativo), asc(produtos.sku))
          .limit(LIMITE_POR_TIPO)
      : Promise.resolve([]),

    temArea('ordens')
      ? db
          .select({
            id: ordensProducao.id,
            numero: ordensProducao.numero,
            status: ordensProducao.status,
            produtoNome: produtos.nome,
          })
          .from(ordensProducao)
          .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
          .where(
            and(
              isNull(ordensProducao.deletedAt),
              ne(ordensProducao.status, 'cancelado'),
              or(ilike(ordensProducao.numero, like), ilike(produtos.nome, like)),
            ),
          )
          .orderBy(desc(ordensProducao.createdAt))
          .limit(LIMITE_POR_TIPO)
      : Promise.resolve([]),

    temArea('produtos')
      ? db
          .select({
            id: kits.id,
            sku: kits.sku,
            nome: kits.nome,
            ativo: kits.ativo,
          })
          .from(kits)
          .where(and(isNull(kits.deletedAt), or(ilike(kits.sku, like), ilike(kits.nome, like))))
          .orderBy(asc(kits.nome))
          .limit(LIMITE_POR_TIPO)
      : Promise.resolve([]),

    temArea('cores')
      ? db
          .select({ id: cores.id, nome: cores.nome, ativo: cores.ativo })
          .from(cores)
          .where(and(isNull(cores.deletedAt), ilike(cores.nome, like)))
          .orderBy(asc(cores.nome))
          .limit(LIMITE_POR_TIPO)
      : Promise.resolve([]),
  ])

  return [
    ...prods.map(
      (p): ResultadoBusca => ({
        tipo: 'produto',
        id: p.id,
        titulo: p.nome,
        subtitulo: p.sku,
        href: `/produtos/${p.id}`,
        inativo: !p.ativo,
      }),
    ),
    ...ops.map(
      (o): ResultadoBusca => ({
        tipo: 'op',
        id: o.id,
        titulo: `${o.numero} — ${o.produtoNome}`,
        subtitulo: STATUS_LABEL_CURTO[o.status],
        // Lista filtrada pelo número (acessível a qualquer cargo com a área).
        href: `/ordens?q=${encodeURIComponent(o.numero)}`,
      }),
    ),
    ...kitsRows.map(
      (k): ResultadoBusca => ({
        tipo: 'kit',
        id: k.id,
        titulo: k.nome,
        subtitulo: k.sku,
        href: '/kits',
        inativo: !k.ativo,
      }),
    ),
    ...coresRows.map(
      (c): ResultadoBusca => ({
        tipo: 'cor',
        id: c.id,
        titulo: c.nome,
        subtitulo: 'Cor',
        href: '/variacoes?tab=cores',
        inativo: !c.ativo,
      }),
    ),
  ]
}
