'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import {
  requireArea,
  requireAreaEscrita,
} from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { precosDeMarketplace } from '@/lib/db/precos-marketplace'
import {
  kitItens,
  kits,
  kitTamanhoPrecoMarketplace,
  produtos,
  produtoTamanhoPrecoMarketplace,
  tamanhos,
  variacoesProduto,
} from '@/lib/db/schema'
import { chaveDeTamanhos, combinacoesDeTamanho, descreverCombinacao } from '@/lib/kit-tamanhos'
import { nivelDaAreaPara } from '@/lib/auth/permissoes-db'
import { precosPorProduto } from '@/lib/db/precos'
import { centavosParaMoeda, chave, chaveKit } from '@/lib/preco'
import {
  comparadoAoAtacado,
  ehCanalComPreco,
  type CanalComPreco,
  type EstadoVsAtacado,
} from '@/lib/preco-marketplace'

// ⚠️ PREÇO DE ANÚNCIO, NÃO PREÇO DE PEDIDO.
//
// Nada aqui pode ser chamado por src/app/(app)/pedidos/. A regra inteira, com
// o porquê, está no topo de src/lib/preco-marketplace.ts — leia antes de
// importar qualquer coisa deste arquivo em outro lugar.

export type ActionResult = { success: true; message?: string } | { success: false; error: string }

/** Uma linha precificável: produto num tamanho, ou kit numa combinação. */
export type LinhaPreco = {
  // `produto:<id>|<tamanho>` ou `kit:<id>|<combinacao>`. Identifica a linha
  // na tela; a gravação recebe os campos separados, nunca esta string.
  id: string
  tipo: 'produto' | 'kit'
  donoId: string
  modelo: string
  // "Peseira - ACONCHEGO"
  item: string
  // "Casal" (produto) ou "peseira: Casal · capa: 50x50" (kit)
  variacao: string
  // Só pra kit: a chave canônica que vai pro banco.
  combinacao: string | null
  // Só pra produto: o nome do tamanho.
  tamanho: string | null
  // Preço por canal, já mascarado ("149,99"). Ausente = sem preço.
  precos: Partial<Record<CanalComPreco, string>>

  /**
   * Como o anúncio de cada canal se compara ao preço de ATACADO do mesmo par.
   *
   * ⚠️ ISTO VAI PRA TODO MUNDO QUE VÊ A TELA, inclusive quem não pode ver o
   * preço de atacado: 'abaixo' não revela valor nenhum e é a informação que
   * evita o prejuízo. O NÚMERO do atacado, esse sim, só sai do servidor pra
   * quem tem a área `precosCatalogo` — mesmo padrão do commit 406d003.
   */
  estados: Partial<Record<CanalComPreco, EstadoVsAtacado>>

  /** O atacado do par, mascarado. Ausente quando não pode ver (ou não há). */
  atacado?: string
}

const SEM_MODELO = '(sem modelo)'

/**
 * A grade inteira: toda combinação precificável do catálogo, com o que já
 * tem preço em cada canal.
 *
 * Mostra TODAS as combinações, inclusive as sem preço nenhum — é uma tela de
 * conferência de anúncio, e a linha vazia é justamente o que precisa
 * aparecer ("este tamanho não tem anúncio em lugar nenhum").
 */
export async function listarPrecosMarketplace(): Promise<LinhaPreco[]> {
  const user = await requireArea('precosMarketplace')

  // O PREÇO DE ATACADO DO MESMO PAR entra na mesma leva — uma consulta pra
  // lista inteira (`precosPorProduto`), nada de uma por linha.
  //
  // ⚠️ SÓ PRODUTO. Kit não entra na comparação: o atacado do kit é por
  // COMBINAÇÃO e, quando não há preço fechado, cai na soma dos componentes —
  // comparar o anúncio com uma soma daria um número que ninguém nunca cobrou.
  // Linha de kit fica sem estado, que é a resposta honesta.
  const [linhasProduto, variacoes, itens, kitsAtivos, porCanal, nivelPreco] =
    await Promise.all([
    db
      .select({ id: produtos.id, nome: produtos.nome })
      .from(produtos)
      .where(isNull(produtos.deletedAt)),
    db
      .selectDistinct({
        produtoId: variacoesProduto.produtoId,
        modelo: variacoesProduto.modelo,
        tamanho: variacoesProduto.tamanho,
      })
      .from(variacoesProduto)
      .where(isNull(variacoesProduto.deletedAt)),
    db
      .select({
        kitId: kitItens.kitId,
        produtoId: kitItens.produtoId,
        quantidade: kitItens.quantidade,
      })
      .from(kitItens),
    db.select({ id: kits.id, nome: kits.nome }).from(kits).where(isNull(kits.deletedAt)),
    precosDeMarketplace(),
    nivelDaAreaPara(user.role, 'precosCatalogo'),
  ])
  const vePrecoDeAtacado = nivelPreco !== 'nenhum'
  const atacadoPorProduto = await precosPorProduto(linhasProduto.map((p) => p.id))

  const nomeProduto = new Map(linhasProduto.map((p) => [p.id, p.nome]))
  const tamanhosDoProduto = new Map<string, string[]>()
  const modeloDoProduto = new Map<string, string>()
  for (const v of variacoes) {
    if (v.tamanho) {
      const lista = tamanhosDoProduto.get(v.produtoId) ?? []
      if (!lista.includes(v.tamanho)) lista.push(v.tamanho)
      tamanhosDoProduto.set(v.produtoId, lista)
    }
    if (v.modelo && !modeloDoProduto.has(v.produtoId)) {
      modeloDoProduto.set(v.produtoId, v.modelo)
    }
  }
  const tamanhosDe = (produtoId: string) => tamanhosDoProduto.get(produtoId) ?? []

  const mascarar = (centavos: number | undefined) =>
    centavos == null ? undefined : centavosParaMoeda(centavos)

  const linhas: LinhaPreco[] = []

  // ── Produtos ──
  for (const p of linhasProduto) {
    for (const tamanho of tamanhosDe(p.id)) {
      const precos: LinhaPreco['precos'] = {}
      const estados: LinhaPreco['estados'] = {}
      const atacado = atacadoPorProduto
        .get(p.id)
        ?.get(tamanho.trim().toLowerCase())

      for (const [canal, tabela] of Object.entries(porCanal)) {
        const centavos = tabela.produto[chave(p.id, tamanho)]
        const v = mascarar(centavos)
        if (v !== undefined) precos[canal as CanalComPreco] = v
        const estado = comparadoAoAtacado(centavos, atacado)
        if (estado !== null) estados[canal as CanalComPreco] = estado
      }

      linhas.push({
        id: `produto:${p.id}|${tamanho}`,
        tipo: 'produto',
        donoId: p.id,
        modelo: modeloDoProduto.get(p.id) ?? SEM_MODELO,
        item: p.nome,
        variacao: tamanho,
        combinacao: null,
        tamanho,
        precos,
        estados,
        // O número só atravessa pra quem pode vê-lo; o estado acima vai pra
        // todos.
        ...(vePrecoDeAtacado && atacado != null
          ? { atacado: centavosParaMoeda(atacado) }
          : {}),
      })
    }
  }

  // ── Kits ──
  for (const k of kitsAtivos) {
    const componentes = itens
      .filter((i) => i.kitId === k.id)
      .map((i) => ({
        produtoId: i.produtoId,
        nome: nomeProduto.get(i.produtoId) ?? 'componente',
      }))
    if (componentes.length === 0) continue

    for (const escolhas of combinacoesDeTamanho(componentes, tamanhosDe)) {
      // A MESMA chave do builder do pedido e do cadastro de kit.
      const combinacao = chaveDeTamanhos(componentes, escolhas, tamanhosDe)
      if (combinacao === null) continue

      const precos: LinhaPreco['precos'] = {}
      for (const [canal, tabela] of Object.entries(porCanal)) {
        const v = mascarar(tabela.kit[chaveKit(k.id, combinacao)])
        if (v !== undefined) precos[canal as CanalComPreco] = v
      }
      linhas.push({
        id: `kit:${k.id}|${combinacao}`,
        tipo: 'kit',
        // Kit não compara com atacado — ver o comentário lá em cima.
        estados: {},
        donoId: k.id,
        modelo: modeloDoProduto.get(componentes[0]!.produtoId) ?? SEM_MODELO,
        item: k.nome,
        // Encurta o nome do componente no rótulo: "Peseira - ACONCHEGO:
        // Casal" dentro de uma linha que já diz ACONCHEGO é ruído.
        variacao: descreverCombinacao(componentes, escolhas, tamanhosDe).replace(
          / - [^:·]+:/g,
          ':',
        ),
        combinacao,
        tamanho: null,
        precos,
      })
    }
  }

  return linhas.sort(
    (a, b) =>
      a.modelo.localeCompare(b.modelo) ||
      a.tipo.localeCompare(b.tipo) ||
      a.item.localeCompare(b.item) ||
      a.variacao.localeCompare(b.variacao),
  )
}

// -----------------------------------------------------------------
// Gravação
// -----------------------------------------------------------------

/** "149,99" → 149.99. Vazio → null (apaga a linha, nunca vira zero). */
function paraDecimal(valor: string): number | null | 'invalido' {
  const limpo = valor.trim().replace(/\./g, '').replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  if (!Number.isFinite(n) || n < 0) return 'invalido'
  return n
}

/**
 * Grava (ou apaga) UMA célula da grade.
 *
 * Vazio APAGA em vez de gravar zero — mesma convenção do resto do catálogo
 * (ver `salvarPrecosDoProduto`). Zero seria uma afirmação: "este anúncio é
 * de graça".
 */
export async function salvarPrecoMarketplaceAction(entrada: {
  tipo: 'produto' | 'kit'
  donoId: string
  // produto
  tamanho?: string | null
  // kit
  combinacao?: string | null
  canal: string
  valor: string
}): Promise<ActionResult> {
  await requireAreaEscrita('precosMarketplace')

  if (!ehCanalComPreco(entrada.canal)) {
    return { success: false, error: 'Canal inválido' }
  }
  const decimal = paraDecimal(entrada.valor)
  if (decimal === 'invalido') {
    return { success: false, error: 'Informe um preço válido (>= 0)' }
  }

  if (entrada.tipo === 'produto') {
    if (!entrada.tamanho) return { success: false, error: 'Tamanho ausente' }
    const [t] = await db
      .select({ id: tamanhos.id })
      .from(tamanhos)
      .where(and(eq(tamanhos.nome, entrada.tamanho), isNull(tamanhos.deletedAt)))
      .limit(1)
    if (!t) return { success: false, error: 'Tamanho não encontrado' }

    if (decimal === null) {
      await db
        .delete(produtoTamanhoPrecoMarketplace)
        .where(
          and(
            eq(produtoTamanhoPrecoMarketplace.produtoId, entrada.donoId),
            eq(produtoTamanhoPrecoMarketplace.tamanhoId, t.id),
            eq(produtoTamanhoPrecoMarketplace.marketplace, entrada.canal),
          ),
        )
    } else {
      await db
        .insert(produtoTamanhoPrecoMarketplace)
        .values({
          produtoId: entrada.donoId,
          tamanhoId: t.id,
          marketplace: entrada.canal,
          preco: decimal.toFixed(2),
        })
        .onConflictDoUpdate({
          target: [
            produtoTamanhoPrecoMarketplace.produtoId,
            produtoTamanhoPrecoMarketplace.tamanhoId,
            produtoTamanhoPrecoMarketplace.marketplace,
          ],
          set: { preco: decimal.toFixed(2) },
        })
    }
  } else {
    // '' é combinação VÁLIDA (kit sem componente variável), então o teste é
    // contra null/undefined, nunca contra falsy.
    if (entrada.combinacao == null) {
      return { success: false, error: 'Combinação ausente' }
    }
    if (decimal === null) {
      await db
        .delete(kitTamanhoPrecoMarketplace)
        .where(
          and(
            eq(kitTamanhoPrecoMarketplace.kitId, entrada.donoId),
            eq(kitTamanhoPrecoMarketplace.combinacao, entrada.combinacao),
            eq(kitTamanhoPrecoMarketplace.marketplace, entrada.canal),
          ),
        )
    } else {
      await db
        .insert(kitTamanhoPrecoMarketplace)
        .values({
          kitId: entrada.donoId,
          combinacao: entrada.combinacao,
          marketplace: entrada.canal,
          preco: decimal.toFixed(2),
        })
        .onConflictDoUpdate({
          target: [
            kitTamanhoPrecoMarketplace.kitId,
            kitTamanhoPrecoMarketplace.combinacao,
            kitTamanhoPrecoMarketplace.marketplace,
          ],
          set: { preco: decimal.toFixed(2) },
        })
    }
  }

  revalidatePath('/precos-marketplace')
  return {
    success: true,
    message: decimal === null ? 'Preço removido' : 'Preço salvo',
  }
}
