'use server'

import { desc, eq, isNotNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  cores,
  estacoes,
  kits,
  maquinas,
  modelos,
  ordensProducao,
  produtos,
  tamanhos,
  variacoesProduto,
} from '@/lib/db/schema'

// Lixeira: tudo no sistema é soft-delete (deleted_at). Aqui o admin vê o
// que foi excluído e pode restaurar. Restauração remove o deleted_at (e
// reativa onde a tabela tem `ativo`).

export type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }

export type TipoLixeira =
  | 'produto'
  | 'op'
  | 'kit'
  | 'cor'
  | 'modelo'
  | 'tamanho'
  | 'maquina'
  | 'estacao'

export type ItemLixeira = {
  tipo: TipoLixeira
  id: string
  titulo: string
  subtitulo: string
  excluidoEm: Date
}

const LIMITE_POR_TIPO = 50

export async function listarExcluidos(): Promise<ItemLixeira[]> {
  await requireRole(['admin'])

  const [prods, ops, kitsRows, coresRows, modelosRows, tamanhosRows, maqs, ests] =
    await Promise.all([
      db
        .select({ id: produtos.id, nome: produtos.nome, sku: produtos.sku, em: produtos.deletedAt })
        .from(produtos)
        .where(isNotNull(produtos.deletedAt))
        .orderBy(desc(produtos.deletedAt))
        .limit(LIMITE_POR_TIPO),
      db
        .select({ id: ordensProducao.id, numero: ordensProducao.numero, em: ordensProducao.deletedAt, produtoNome: produtos.nome })
        .from(ordensProducao)
        .innerJoin(produtos, eq(produtos.id, ordensProducao.produtoId))
        .where(isNotNull(ordensProducao.deletedAt))
        .orderBy(desc(ordensProducao.deletedAt))
        .limit(LIMITE_POR_TIPO),
      db
        .select({ id: kits.id, nome: kits.nome, sku: kits.sku, em: kits.deletedAt })
        .from(kits)
        .where(isNotNull(kits.deletedAt))
        .orderBy(desc(kits.deletedAt))
        .limit(LIMITE_POR_TIPO),
      db
        .select({ id: cores.id, nome: cores.nome, em: cores.deletedAt })
        .from(cores)
        .where(isNotNull(cores.deletedAt))
        .orderBy(desc(cores.deletedAt))
        .limit(LIMITE_POR_TIPO),
      db
        .select({ id: modelos.id, nome: modelos.nome, em: modelos.deletedAt })
        .from(modelos)
        .where(isNotNull(modelos.deletedAt))
        .orderBy(desc(modelos.deletedAt))
        .limit(LIMITE_POR_TIPO),
      db
        .select({ id: tamanhos.id, nome: tamanhos.nome, em: tamanhos.deletedAt })
        .from(tamanhos)
        .where(isNotNull(tamanhos.deletedAt))
        .orderBy(desc(tamanhos.deletedAt))
        .limit(LIMITE_POR_TIPO),
      db
        .select({ id: maquinas.id, nome: maquinas.nome, codigo: maquinas.codigo, em: maquinas.deletedAt })
        .from(maquinas)
        .where(isNotNull(maquinas.deletedAt))
        .orderBy(desc(maquinas.deletedAt))
        .limit(LIMITE_POR_TIPO),
      db
        .select({ id: estacoes.id, nome: estacoes.nome, em: estacoes.deletedAt })
        .from(estacoes)
        .where(isNotNull(estacoes.deletedAt))
        .orderBy(desc(estacoes.deletedAt))
        .limit(LIMITE_POR_TIPO),
    ])

  const itens: ItemLixeira[] = [
    ...prods.map((p): ItemLixeira => ({ tipo: 'produto', id: p.id, titulo: p.nome, subtitulo: p.sku, excluidoEm: p.em! })),
    ...ops.map((o): ItemLixeira => ({ tipo: 'op', id: o.id, titulo: `${o.numero} — ${o.produtoNome}`, subtitulo: 'volta como cancelada', excluidoEm: o.em! })),
    ...kitsRows.map((k): ItemLixeira => ({ tipo: 'kit', id: k.id, titulo: k.nome, subtitulo: k.sku, excluidoEm: k.em! })),
    ...coresRows.map((c): ItemLixeira => ({ tipo: 'cor', id: c.id, titulo: c.nome, subtitulo: 'Cor', excluidoEm: c.em! })),
    ...modelosRows.map((m): ItemLixeira => ({ tipo: 'modelo', id: m.id, titulo: m.nome, subtitulo: 'Modelo', excluidoEm: m.em! })),
    ...tamanhosRows.map((t): ItemLixeira => ({ tipo: 'tamanho', id: t.id, titulo: t.nome, subtitulo: 'Tamanho', excluidoEm: t.em! })),
    ...maqs.map((m): ItemLixeira => ({ tipo: 'maquina', id: m.id, titulo: m.nome, subtitulo: m.codigo, excluidoEm: m.em! })),
    ...ests.map((e): ItemLixeira => ({ tipo: 'estacao', id: e.id, titulo: e.nome, subtitulo: 'máquinas precisam ser revinculadas', excluidoEm: e.em! })),
  ]

  // Mais recentes primeiro, tipos misturados.
  itens.sort((a, b) => b.excluidoEm.getTime() - a.excluidoEm.getTime())
  return itens
}

export async function restaurarAction(
  tipo: TipoLixeira,
  id: string,
): Promise<ActionResult> {
  await requireRole(['admin'])

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(id)) return { success: false, error: 'ID inválido' }

  try {
    switch (tipo) {
      case 'produto':
        await db.transaction(async (tx) => {
          await tx
            .update(produtos)
            .set({ deletedAt: null, ativo: true })
            .where(eq(produtos.id, id))
          // Restaura as variações junto (o soft delete do produto derruba
          // todas; restaurar tudo é o comportamento menos surpreendente).
          await tx
            .update(variacoesProduto)
            .set({ deletedAt: null })
            .where(eq(variacoesProduto.produtoId, id))
        })
        break
      case 'op':
        // Volta com o status que tinha ao ser excluída (cancelado, na
        // prática) — o usuário reativa pelo fluxo normal.
        await db
          .update(ordensProducao)
          .set({ deletedAt: null })
          .where(eq(ordensProducao.id, id))
        break
      case 'kit':
        await db
          .update(kits)
          .set({ deletedAt: null, ativo: true })
          .where(eq(kits.id, id))
        break
      case 'cor':
        await db
          .update(cores)
          .set({ deletedAt: null, ativo: true })
          .where(eq(cores.id, id))
        break
      case 'modelo':
        await db
          .update(modelos)
          .set({ deletedAt: null, ativo: true })
          .where(eq(modelos.id, id))
        break
      case 'tamanho':
        await db
          .update(tamanhos)
          .set({ deletedAt: null, ativo: true })
          .where(eq(tamanhos.id, id))
        break
      case 'maquina':
        await db
          .update(maquinas)
          .set({ deletedAt: null })
          .where(eq(maquinas.id, id))
        break
      case 'estacao':
        await db
          .update(estacoes)
          .set({ deletedAt: null, ativo: true })
          .where(eq(estacoes.id, id))
        break
      default:
        return { success: false, error: 'Tipo desconhecido' }
    }
  } catch (e) {
    // Índices únicos parciais (SKU/nome/código entre não-excluídos): se o
    // identificador foi reutilizado, a restauração conflita.
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      return {
        success: false,
        error:
          'Não dá pra restaurar: o SKU/nome/código já está em uso por outro item ativo.',
      }
    }
    throw e
  }

  revalidatePath('/lixeira')
  return { success: true, message: 'Item restaurado' }
}
