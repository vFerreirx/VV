'use server'

import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  deParaFull,
  deParaFullComponentes,
  eventosKanban,
  kitItens,
  ordensProducao,
  produtos,
  remessasFull,
  variacoesProduto,
} from '@/lib/db/schema'
import { isUniqueViolation } from '@/lib/db/is-unique-violation'
import { ErroLeitura, lerEnvioFull } from '@/lib/full-import'
import { normalizarSku } from '@/lib/full-import/pdf-texto'
import type { ItemLido } from '@/lib/full-import/tipos'
import {
  deParaSchema,
  importarFullSchema,
  type DeParaInput,
  type ImportarFullInput,
} from '@/lib/validators/full-import'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Tipos da conferência
// -----------------------------------------------------------------

export type ComponenteResolvido = {
  variacaoId: string
  quantidade: number
  produtoNome: string
  skuVariacao: string
  cor: string | null
  tamanho: string | null
  modelo: string | null
}

// Como o item foi resolvido:
//   automatico — o SKU do envio bateu com uma variação do catálogo
//   de_para    — já existia mapeamento salvo pra esse código
//   pendente   — ninguém sabe ainda o que produzir; a pessoa mapeia
export type OrigemItem = 'automatico' | 'de_para' | 'pendente'

export type ItemConferencia = ItemLido & {
  origem: OrigemItem
  componentes: ComponenteResolvido[]
  // Mapeamento salvo existe mas o SKU/descrição do PDF mudou desde então:
  // o item NÃO entra reconhecido sem alguém confirmar.
  alterado: boolean
  skuAnterior: string | null
  descricaoAnterior: string | null
  kitIdSugerido: string | null
}

export type Conferencia = {
  canal: 'full_ml' | 'full_shopee'
  documento: string
  envioId: string | null
  totalDeclarado: number
  totalLido: number
  itens: ItemConferencia[]
  avisos: string[]
  // Envio já importado antes (mesmo canal + mesmo identificador).
  // `opsAtivas` = 0 significa que a remessa antiga é uma casca vazia: ela só
  // está segurando o identificador do envio. Nesse caso a mensagem manda
  // excluir a remessa, em vez de deixar a pessoa travada sem saber por quê.
  jaImportado: {
    remessaId: string
    dataEnvio: string
    opsAtivas: number
  } | null
}

// -----------------------------------------------------------------
// Leitura do PDF + resolução
// -----------------------------------------------------------------

// Lê o PDF e devolve a CONFERÊNCIA. Não grava OP nenhuma — o arquivo é
// lido, os dados extraídos e os bytes descartados com a requisição.
export async function analisarPdfFullAction(form: FormData): Promise<ActionResult<Conferencia>> {
  await requireAreaEscrita('ordens')

  const arquivo = form.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { success: false, error: 'Escolha um arquivo PDF' }
  }

  let leitura
  try {
    leitura = await lerEnvioFull(new Uint8Array(await arquivo.arrayBuffer()))
  } catch (e) {
    if (e instanceof ErroLeitura) return { success: false, error: e.message }
    throw e
  }

  const itens = await resolverItens(leitura.canal, leitura.itens)

  // Envio repetido: avisa na conferência (não bloqueia a leitura, mas a
  // confirmação recusa).
  let jaImportado: Conferencia['jaImportado'] = null
  if (leitura.envioId) {
    const [r] = await db
      .select({ id: remessasFull.id, dataEnvio: remessasFull.dataEnvio })
      .from(remessasFull)
      .where(
        and(
          eq(remessasFull.canal, leitura.canal),
          eq(remessasFull.envioId, leitura.envioId),
          isNull(remessasFull.deletedAt),
        ),
      )
      .limit(1)
    if (r) {
      const [agg] = await db
        .select({ ativas: sql<number>`count(*)::int` })
        .from(ordensProducao)
        .where(
          and(
            eq(ordensProducao.remessaFullId, r.id),
            isNull(ordensProducao.deletedAt),
            ne(ordensProducao.status, 'cancelado'),
          ),
        )
      jaImportado = {
        remessaId: r.id,
        dataEnvio: r.dataEnvio,
        opsAtivas: agg?.ativas ?? 0,
      }
    }
  }

  return {
    success: true,
    data: {
      canal: leitura.canal,
      documento: leitura.documento,
      envioId: leitura.envioId,
      totalDeclarado: leitura.totalDeclarado,
      totalLido: leitura.totalLido,
      itens,
      avisos: leitura.avisos,
      jaImportado,
    },
  }
}

// Resolve cada item lido em "o que produzir".
async function resolverItens(
  canal: 'full_ml' | 'full_shopee',
  lidos: ItemLido[],
): Promise<ItemConferencia[]> {
  // 1) De-para salvo, pela CHAVE (canal + código).
  const codigos = lidos.map((i) => i.codigo)
  const mapeamentos = codigos.length
    ? await db
        .select({
          id: deParaFull.id,
          codigo: deParaFull.codigo,
          kitId: deParaFull.kitId,
          skuVisto: deParaFull.skuVisto,
          descricaoVista: deParaFull.descricaoVista,
        })
        .from(deParaFull)
        .where(
          and(
            eq(deParaFull.canal, canal),
            inArray(deParaFull.codigo, codigos),
            isNull(deParaFull.deletedAt),
          ),
        )
    : []
  const porCodigo = new Map(mapeamentos.map((m) => [m.codigo, m]))

  const componentesPorMapa = new Map<string, ComponenteResolvido[]>()
  if (mapeamentos.length > 0) {
    const comps = await db
      .select({
        deParaId: deParaFullComponentes.deParaId,
        variacaoId: deParaFullComponentes.variacaoId,
        quantidade: deParaFullComponentes.quantidade,
        skuVariacao: variacoesProduto.skuVariacao,
        cor: variacoesProduto.cor,
        tamanho: variacoesProduto.tamanho,
        modelo: variacoesProduto.modelo,
        produtoNome: produtos.nome,
      })
      .from(deParaFullComponentes)
      .innerJoin(variacoesProduto, eq(variacoesProduto.id, deParaFullComponentes.variacaoId))
      .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
      .where(
        inArray(
          deParaFullComponentes.deParaId,
          mapeamentos.map((m) => m.id),
        ),
      )
    for (const c of comps) {
      const arr = componentesPorMapa.get(c.deParaId)
      const item: ComponenteResolvido = {
        variacaoId: c.variacaoId,
        quantidade: c.quantidade,
        produtoNome: c.produtoNome,
        skuVariacao: c.skuVariacao,
        cor: c.cor,
        tamanho: c.tamanho,
        modelo: c.modelo,
      }
      if (arr) arr.push(item)
      else componentesPorMapa.set(c.deParaId, [item])
    }
  }

  // 2) Casamento automático pelo SKU do envio contra variacoes_produto.
  //    Vale pros produtos AVULSOS: os kits do marketplace usam um SKU por
  //    combinação de cores e nunca batem com o molde sem cor do sistema.
  const skus = [...new Set(lidos.map((i) => normalizarSku(i.sku)).filter(Boolean))]
  const porSku = new Map<string, ComponenteResolvido>()
  if (skus.length > 0) {
    const vars = await db
      .select({
        id: variacoesProduto.id,
        skuVariacao: variacoesProduto.skuVariacao,
        cor: variacoesProduto.cor,
        tamanho: variacoesProduto.tamanho,
        modelo: variacoesProduto.modelo,
        produtoNome: produtos.nome,
      })
      .from(variacoesProduto)
      .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
      .where(
        and(
          isNull(variacoesProduto.deletedAt),
          inArray(sql`upper(replace(${variacoesProduto.skuVariacao}, ' ', ''))`, skus),
        ),
      )
    for (const v of vars) {
      porSku.set(normalizarSku(v.skuVariacao), {
        variacaoId: v.id,
        quantidade: 1,
        produtoNome: v.produtoNome,
        skuVariacao: v.skuVariacao,
        cor: v.cor,
        tamanho: v.tamanho,
        modelo: v.modelo,
      })
    }
  }

  return lidos.map((it) => {
    const mapa = porCodigo.get(it.codigo)
    if (mapa) {
      const comps = componentesPorMapa.get(mapa.id) ?? []
      // O código é estável, mas dá pra editar o anúncio mantendo o mesmo
      // código — então comparo o que vi antes com o que veio agora.
      const alterado =
        comps.length === 0 ||
        (mapa.skuVisto !== null && normalizarSku(mapa.skuVisto) !== normalizarSku(it.sku)) ||
        (mapa.descricaoVista !== null && mapa.descricaoVista.trim() !== it.descricao.trim())
      return {
        ...it,
        origem: (alterado ? 'pendente' : 'de_para') as OrigemItem,
        componentes: comps,
        alterado,
        skuAnterior: mapa.skuVisto,
        descricaoAnterior: mapa.descricaoVista,
        kitIdSugerido: mapa.kitId,
      }
    }

    const auto = porSku.get(normalizarSku(it.sku))
    if (auto) {
      return {
        ...it,
        origem: 'automatico' as OrigemItem,
        componentes: [auto],
        alterado: false,
        skuAnterior: null,
        descricaoAnterior: null,
        kitIdSugerido: null,
      }
    }

    return {
      ...it,
      origem: 'pendente' as OrigemItem,
      componentes: [],
      alterado: false,
      skuAnterior: null,
      descricaoAnterior: null,
      kitIdSugerido: null,
    }
  })
}

// -----------------------------------------------------------------
// De-para: salvar / consultar
// -----------------------------------------------------------------

// Cria ou atualiza o de-para de um código e devolve os componentes já
// resolvidos, pra tela atualizar a linha sem reler o PDF.
export async function salvarDeParaAction(
  input: DeParaInput,
): Promise<ActionResult<ComponenteResolvido[]>> {
  const user = await requireAreaEscrita('ordens')
  const parsed = deParaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const d = parsed.data

  // Componentes repetidos (mesma variação escolhida duas vezes) viram um só.
  const somados = new Map<string, number>()
  for (const c of d.componentes) {
    somados.set(c.variacaoId, (somados.get(c.variacaoId) ?? 0) + c.quantidade)
  }
  const variacaoIds = [...somados.keys()]

  const existentes = await db
    .select({ id: variacoesProduto.id })
    .from(variacoesProduto)
    .where(and(inArray(variacoesProduto.id, variacaoIds), isNull(variacoesProduto.deletedAt)))
  if (existentes.length !== variacaoIds.length) {
    return { success: false, error: 'Alguma variação escolhida não existe mais' }
  }

  await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(deParaFull)
      .values({
        canal: d.canal,
        codigo: d.codigo,
        kitId: d.kitId ?? null,
        skuVisto: d.skuVisto ?? null,
        descricaoVista: d.descricaoVista ?? null,
        criadoPor: user.id,
      })
      .onConflictDoUpdate({
        target: [deParaFull.canal, deParaFull.codigo],
        targetWhere: isNull(deParaFull.deletedAt),
        set: {
          kitId: d.kitId ?? null,
          skuVisto: d.skuVisto ?? null,
          descricaoVista: d.descricaoVista ?? null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: deParaFull.id })

    // Regrava os componentes do zero — mais simples e sem estado velho.
    await tx.delete(deParaFullComponentes).where(eq(deParaFullComponentes.deParaId, linha!.id))
    await tx.insert(deParaFullComponentes).values(
      [...somados.entries()].map(([variacaoId, quantidade]) => ({
        deParaId: linha!.id,
        variacaoId,
        quantidade,
      })),
    )
  })

  const comps = await db
    .select({
      variacaoId: variacoesProduto.id,
      skuVariacao: variacoesProduto.skuVariacao,
      cor: variacoesProduto.cor,
      tamanho: variacoesProduto.tamanho,
      modelo: variacoesProduto.modelo,
      produtoNome: produtos.nome,
    })
    .from(variacoesProduto)
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(inArray(variacoesProduto.id, variacaoIds))
    .orderBy(asc(produtos.nome))

  return {
    success: true,
    message: 'Mapeamento salvo',
    data: comps.map((c) => ({
      variacaoId: c.variacaoId,
      quantidade: somados.get(c.variacaoId) ?? 1,
      produtoNome: c.produtoNome,
      skuVariacao: c.skuVariacao,
      cor: c.cor,
      tamanho: c.tamanho,
      modelo: c.modelo,
    })),
  }
}

// Itens de um kit — usados pra montar as linhas do de-para já com o produto
// e a quantidade certos, deixando só a cor pra escolher.
export type KitItemParaDePara = {
  id: string
  produtoId: string
  produtoNome: string
  quantidade: number
}

export async function listarItensDoKit(kitId: string): Promise<KitItemParaDePara[]> {
  await requireArea('ordens')
  const rows = await db
    .select({
      id: kitItens.id,
      produtoId: kitItens.produtoId,
      produtoNome: produtos.nome,
      quantidade: kitItens.quantidade,
    })
    .from(kitItens)
    .innerJoin(produtos, eq(produtos.id, kitItens.produtoId))
    .where(eq(kitItens.kitId, kitId))
    .orderBy(asc(produtos.nome))
  return rows
}

// -----------------------------------------------------------------
// Confirmação: cria a remessa + as OPs já explodidas
// -----------------------------------------------------------------

export async function importarFullAction(
  input: ImportarFullInput,
): Promise<ActionResult<{ ops: number; pecas: number }>> {
  const user = await requireAreaEscrita('ordens')
  const parsed = importarFullSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const d = parsed.data

  // Soma por variação (a tela já agrega, mas o servidor não confia nela).
  const somados = new Map<string, number>()
  for (const it of d.itens) {
    somados.set(it.variacaoId, (somados.get(it.variacaoId) ?? 0) + it.quantidade)
  }
  const pecas = [...somados.values()].reduce((s, q) => s + q, 0)
  if (pecas !== d.totalPecas) {
    return {
      success: false,
      error:
        'A conferência mudou enquanto você confirmava. Recarregue e confira ' +
        'de novo antes de criar as OPs.',
    }
  }

  const variacaoIds = [...somados.keys()]
  const vars = await db
    .select({ id: variacoesProduto.id, produtoId: variacoesProduto.produtoId })
    .from(variacoesProduto)
    .where(and(inArray(variacoesProduto.id, variacaoIds), isNull(variacoesProduto.deletedAt)))
  if (vars.length !== variacaoIds.length) {
    return { success: false, error: 'Alguma variação não existe mais' }
  }
  const produtoDaVariacao = new Map(vars.map((v) => [v.id, v.produtoId]))

  // Envio já importado? A trava real é o índice único, mas conferir antes
  // dá uma mensagem melhor que um erro de constraint.
  if (d.envioId) {
    const [r] = await db
      .select({ id: remessasFull.id })
      .from(remessasFull)
      .where(
        and(
          eq(remessasFull.canal, d.canal),
          eq(remessasFull.envioId, d.envioId),
          isNull(remessasFull.deletedAt),
        ),
      )
      .limit(1)
    if (r) {
      return {
        success: false,
        error:
          `O envio ${d.envioId} já foi importado antes. Se precisar ` +
          'refazer, exclua a remessa antiga primeiro.',
      }
    }
  }

  const resultado = await db
    .transaction(async (tx) => {
      let remessa: { id: string; canal: string; dataEnvio: string }
      if (d.remessaId) {
        const [r] = await tx
          .select({
            id: remessasFull.id,
            canal: remessasFull.canal,
            dataEnvio: remessasFull.dataEnvio,
            envioId: remessasFull.envioId,
          })
          .from(remessasFull)
          .where(and(eq(remessasFull.id, d.remessaId), isNull(remessasFull.deletedAt)))
          .limit(1)
        if (!r) throw new Error('FULL_NAO_ENCONTRADO')
        if (r.canal !== d.canal) throw new Error('CANAL_DIFERENTE')
        remessa = r
        // Carimba o identificador do envio no Full escolhido, se ainda não
        // tiver — é o que impede reimportar o mesmo envio depois.
        if (d.envioId && !r.envioId) {
          await tx.update(remessasFull).set({ envioId: d.envioId }).where(eq(remessasFull.id, r.id))
        }
      } else {
        if (!d.dataEnvio) throw new Error('SEM_DATA')
        const [r] = await tx
          .insert(remessasFull)
          .values({
            canal: d.canal,
            dataEnvio: d.dataEnvio,
            envioId: d.envioId ?? null,
          })
          .returning({
            id: remessasFull.id,
            canal: remessasFull.canal,
            dataEnvio: remessasFull.dataEnvio,
          })
        remessa = r!
      }

      const [, m, dia] = remessa.dataEnvio.split('-')
      const rotulo = `${d.canal === 'full_ml' ? 'Full ML' : 'Full Shopee'} · ${dia}/${m}`
      // Data de envio vira o prazo (fim do dia, horário do Brasil) — mesma
      // regra do cadastro manual do Full.
      const prazo = new Date(`${remessa.dataEnvio}T23:59:59-03:00`)
      const origem = d.envioId ? ` (envio ${d.envioId})` : ''

      for (const [variacaoId, quantidade] of somados) {
        const [op] = await tx
          .insert(ordensProducao)
          .values({
            numero: '',
            produtoId: produtoDaVariacao.get(variacaoId)!,
            variacaoId,
            quantidade,
            canalDestino: d.canal,
            prioridade: d.prioridade,
            status: 'programado',
            dataPrevistaFim: prazo,
            remessaFullId: remessa.id,
            criadoPor: user.id,
            observacoes: `Importado do ${rotulo}${origem}`,
          })
          .returning({ id: ordensProducao.id })

        await tx.insert(eventosKanban).values({
          ordemId: op!.id,
          statusAnterior: null,
          statusNovo: 'programado',
          usuarioId: user.id,
          observacao: `OP criada na importação do ${rotulo}`,
        })
      }

      return somados.size
    })
    .catch((e: unknown) => {
      if (e instanceof Error) {
        if (e.message === 'FULL_NAO_ENCONTRADO') return 'FULL_NAO_ENCONTRADO'
        if (e.message === 'CANAL_DIFERENTE') return 'CANAL_DIFERENTE'
        if (e.message === 'SEM_DATA') return 'SEM_DATA'
      }
      // O índice único (canal, envio_id) é a trava DE VERDADE contra
      // reimportar o mesmo envio: a checagem lá em cima não cobre duas
      // importações simultâneas. Sem isso o usuário levaria um erro cru.
      if (isUniqueViolation(e)) return 'ENVIO_DUPLICADO'
      throw e
    })

  if (resultado === 'FULL_NAO_ENCONTRADO') {
    return { success: false, error: 'Full não encontrado' }
  }
  if (resultado === 'CANAL_DIFERENTE') {
    return {
      success: false,
      error: 'O Full escolhido é de outro canal — escolha um do mesmo marketplace',
    }
  }
  if (resultado === 'SEM_DATA') {
    return { success: false, error: 'Informe a data de envio do Full' }
  }
  if (resultado === 'ENVIO_DUPLICADO') {
    return {
      success: false,
      error:
        `O envio ${d.envioId} já foi importado. Se precisar refazer, exclua ` +
        'a remessa antiga primeiro.',
    }
  }

  revalidatePath('/ordens')
  revalidatePath('/producao')
  revalidatePath('/remessas')
  return {
    success: true,
    data: { ops: resultado, pecas },
    message: `${resultado} OP${resultado > 1 ? 's' : ''} criada${resultado > 1 ? 's' : ''} · ${pecas} peças`,
  }
}
