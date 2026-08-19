'use server'

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import {
  compradores,
  kitTamanhoPreco,
  orcamentoFaltantes,
  orcamentoItens,
  orcamentos,
  produtos,
  produtoTamanhoPeso,
  produtoTamanhoPreco,
  tamanhos,
  type Comprador,
  type Orcamento,
  type OrcamentoItem,
} from '@/lib/db/schema'
import {
  ehStatusPedido,
  erroDeTransicao,
  ROTULO_STATUS,
  type StatusPedido,
} from '@/lib/pedido-status'
import { catalogoVazio, chavePeso, type CatalogoPesos } from '@/lib/peso'
import {
  montarCatalogoSeparacao,
  type CatalogoSeparacao,
} from '@/lib/separacao'
import { freteEmCentavos, totalComFrete } from '@/lib/total-pedido'
import {
  chave,
  decimalParaCentavos,
  tabelaVazia,
  type TabelaDePrecos,
} from '@/lib/preco'
import {
  orcamentoSchema,
  type OrcamentoInput,
} from '@/lib/validators/orcamentos'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Leitura
// -----------------------------------------------------------------

// `total` é A MERCADORIA — soma de quantidade × preço dos itens, e só. Não
// mude o sentido dele: é o que a cotação de frete usa pro valor declarado e o
// que o romaneio imprime. Quem quer o valor que o cliente paga usa
// `totalComFrete`, que é DERIVADO na leitura (não tem coluna no banco).
// A regra inteira vive em src/lib/total-pedido.ts.

export type OrcamentoListItem = Orcamento & {
  itensCount: number
  total: number
  totalComFrete: number
  /** Peças marcadas como faltantes na via de separação (0 = nenhuma). */
  faltantes: number
}

export type OrcamentoComItens = Orcamento & {
  itens: OrcamentoItem[]
  total: number
  totalComFrete: number
}

export async function listarOrcamentos(): Promise<OrcamentoListItem[]> {
  await requireArea('vendas')
  const rows = await db
    .select()
    .from(orcamentos)
    .where(isNull(orcamentos.deletedAt))
    .orderBy(desc(orcamentos.numero))

  if (rows.length === 0) return []

  const ids = rows.map((o) => o.id)
  // Duas agregações pra lista INTEIRA, em paralelo — nada de perguntar pedido
  // a pedido.
  const [agg, faltantes] = await Promise.all([
    db
      .select({
        orcamentoId: orcamentoItens.orcamentoId,
        itens: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${orcamentoItens.quantidade} * ${orcamentoItens.precoUnitario}), 0)`,
      })
      .from(orcamentoItens)
      .where(inArray(orcamentoItens.orcamentoId, ids))
      .groupBy(orcamentoItens.orcamentoId),
    // A contagem mora AQUI e não em faltantes-actions.ts: aquele módulo já
    // importa deste (precisa da via de separação pra conferir as chaves), e
    // importar de volta fecharia um ciclo entre dois 'use server'.
    db
      .select({
        orcamentoId: orcamentoFaltantes.orcamentoId,
        total: sql<number>`sum(${orcamentoFaltantes.quantidade})::int`,
      })
      .from(orcamentoFaltantes)
      .where(inArray(orcamentoFaltantes.orcamentoId, ids))
      .groupBy(orcamentoFaltantes.orcamentoId),
  ])
  const m = new Map(agg.map((a) => [a.orcamentoId, a]))
  const f = new Map(faltantes.map((x) => [x.orcamentoId, x.total]))

  return rows.map((o) => {
    const total = Number(m.get(o.id)?.total ?? 0)
    return {
      ...o,
      itensCount: m.get(o.id)?.itens ?? 0,
      total,
      totalComFrete: totalComFrete(total, o.freteValor),
      faltantes: f.get(o.id) ?? 0,
    }
  })
}

export async function obterOrcamento(
  id: string,
): Promise<OrcamentoComItens | null> {
  await requireArea('vendas')
  const [o] = await db
    .select()
    .from(orcamentos)
    .where(and(eq(orcamentos.id, id), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!o) return null

  const itens = await db
    .select()
    .from(orcamentoItens)
    .where(eq(orcamentoItens.orcamentoId, id))
    .orderBy(asc(orcamentoItens.createdAt))

  const total = itens.reduce(
    (s, it) => s + it.quantidade * Number(it.precoUnitario),
    0,
  )
  return { ...o, itens, total, totalComFrete: totalComFrete(total, o.freteValor) }
}

export type OrcamentoParaRomaneio = OrcamentoComItens & {
  comprador: Comprador | null
}

// O romaneio é o único documento que precisa do endereço e do documento do
// comprador. Em vez de engordar `obterOrcamento` — que serve o orçamento e a
// via de separação, já em produção e sem uso nenhum pra esses campos —, esta
// reaproveita aquela e só busca o comprador por cima: uma consulta a mais
// numa tela só, e nada muda no caminho das outras duas.
//
// `comprador` volta null tanto no orçamento antigo (compradorId nulo) quanto
// quando o cadastro foi excluído depois. Nos dois casos o romaneio cai pro
// nome em `orcamentos.cliente`, que é o que já acontece nas outras telas.
export async function obterOrcamentoParaRomaneio(
  id: string,
): Promise<OrcamentoParaRomaneio | null> {
  const orcamento = await obterOrcamento(id)
  if (!orcamento) return null
  if (!orcamento.compradorId) return { ...orcamento, comprador: null }

  const [comprador] = await db
    .select()
    .from(compradores)
    .where(
      and(
        eq(compradores.id, orcamento.compradorId),
        isNull(compradores.deletedAt),
      ),
    )
    .limit(1)

  return { ...orcamento, comprador: comprador ?? null }
}

// Catálogo de pesos pro cálculo do peso do pedido.
//
// Fica FORA de `obterOrcamento` de propósito, no mesmo espírito de
// `obterOrcamentoParaRomaneio`: aquela função serve três telas e nenhuma
// outra precisa disto. Quem quer peso carrega o catálogo e chama
// `calcularPesos` (src/lib/peso.ts), que é puro.
//
// São duas consultas pequenas no catálogo INTEIRO (17 produtos, 6 tamanhos)
// em vez de um join por item: o resolvedor precisa de todos os nomes pra
// conseguir casar por texto nas linhas antigas, que não têm vínculo nenhum.
// Inclui produto/tamanho excluído — um pedido antigo pode apontar pra um
// item que saiu do catálogo, e o peso dele continua valendo.
export async function obterCatalogoDePesos(): Promise<CatalogoPesos> {
  await requireArea('vendas')

  const [pares, prods, tams] = await Promise.all([
    db
      .select({
        produtoId: produtoTamanhoPeso.produtoId,
        produtoNome: produtos.nome,
        tamanho: tamanhos.nome,
        pesoGramas: produtoTamanhoPeso.pesoGramas,
      })
      .from(produtoTamanhoPeso)
      .innerJoin(produtos, eq(produtos.id, produtoTamanhoPeso.produtoId))
      .innerJoin(tamanhos, eq(tamanhos.id, produtoTamanhoPeso.tamanhoId)),
    db.select({ nome: produtos.nome }).from(produtos),
    db
      .select({ nome: tamanhos.nome, pesoGramas: tamanhos.pesoGramas })
      .from(tamanhos),
  ])

  const catalogo = catalogoVazio()
  for (const l of pares) {
    catalogo.porId[chavePeso(l.produtoId, l.tamanho)] = l.pesoGramas
    catalogo.porNome[chavePeso(l.produtoNome, l.tamanho)] = l.pesoGramas
  }
  for (const t of tams) {
    if (t.pesoGramas != null) {
      catalogo.porTamanho[t.nome.trim().toLowerCase()] = t.pesoGramas
    }
  }

  // Do mais LONGO pro mais curto: no fallback por texto, "Peseira -
  // Aconchego" tem que ganhar de "Peseira".
  const porTamanhoDoNome = (a: string, b: string) => b.length - a.length
  catalogo.nomesProduto = [
    ...new Set(prods.map((p) => p.nome.trim().toLowerCase())),
  ].sort(porTamanhoDoNome)
  catalogo.nomesTamanho = [
    ...new Set(tams.map((t) => t.nome.trim().toLowerCase())),
  ].sort(porTamanhoDoNome)

  return catalogo
}

// Catálogo da VIA DE SEPARAÇÃO: o que src/lib/separacao.ts precisa pra saber
// o modelo e o tipo de cada peça, e em que ordem os tamanhos vão.
//
// Mesma forma do `obterCatalogoDePesos` logo acima, e pelo mesmo motivo:
// duas consultas no catálogo inteiro em vez de uma ida ao banco por linha.
// Também inclui produto/tamanho EXCLUÍDO — um pedido antigo pode apontar pra
// item que saiu do catálogo, e ele continua tendo que ser agrupado.
export async function obterCatalogoDeSeparacao(): Promise<CatalogoSeparacao> {
  await requireArea('vendas')

  const [prods, tams] = await Promise.all([
    db.select({ id: produtos.id, nome: produtos.nome }).from(produtos),
    db.select({ nome: tamanhos.nome, ordem: tamanhos.ordem }).from(tamanhos),
  ])

  return montarCatalogoSeparacao(prods, tams)
}

// Catálogo de PREÇO DE TABELA, pra sugerir o preço unitário no builder.
//
// Mesma forma do `obterCatalogoDePesos` logo acima: duas consultas pequenas
// no catálogo inteiro (29 preços hoje) em vez de ida ao banco por linha
// digitada. Chaveado por (id do dono, nome do tamanho em minúscula) porque
// é assim que o builder conhece o tamanho — texto vindo da variação, não FK.
//
// ATENÇÃO: isto é SUGESTÃO, não o preço do pedido. Ver o topo de
// src/lib/preco.ts — `orcamento_itens.preco_unitario` é snapshot e não muda
// quando o preço de tabela muda.
export async function obterCatalogoDePrecos(): Promise<TabelaDePrecos> {
  await requireArea('vendas')

  const [deProduto, deKit] = await Promise.all([
    db
      .select({
        donoId: produtoTamanhoPreco.produtoId,
        tamanho: tamanhos.nome,
        preco: produtoTamanhoPreco.preco,
      })
      .from(produtoTamanhoPreco)
      .innerJoin(tamanhos, eq(tamanhos.id, produtoTamanhoPreco.tamanhoId)),
    db
      .select({
        donoId: kitTamanhoPreco.kitId,
        tamanho: tamanhos.nome,
        preco: kitTamanhoPreco.preco,
      })
      .from(kitTamanhoPreco)
      .innerJoin(tamanhos, eq(tamanhos.id, kitTamanhoPreco.tamanhoId)),
  ])

  const tabela = tabelaVazia()
  for (const l of deProduto) {
    tabela.produto[chave(l.donoId, l.tamanho)] = decimalParaCentavos(l.preco)
  }
  for (const l of deKit) {
    tabela.kit[chave(l.donoId, l.tamanho)] = decimalParaCentavos(l.preco)
  }
  return tabela
}

// Clientes já usados (distintos, mais recentes primeiro) — autocomplete.
export async function listarClientesOrcamentos(): Promise<string[]> {
  await requireArea('vendas')
  const rows = await db
    .select({ cliente: orcamentos.cliente })
    .from(orcamentos)
    .where(isNull(orcamentos.deletedAt))
    .orderBy(desc(orcamentos.createdAt))
    .limit(200)

  const vistos = new Set<string>()
  const clientes: string[] = []
  for (const r of rows) {
    const nome = r.cliente.trim()
    const chave = nome.toLowerCase()
    if (nome && !vistos.has(chave)) {
      vistos.add(chave)
      clientes.push(nome)
    }
  }
  return clientes.slice(0, 50)
}

// Último preço usado por descrição (em qualquer orçamento não excluído).
// Serve pra pré-preencher o preço ao puxar produto/kit do catálogo.
export async function listarPrecosRecentes(): Promise<
  Record<string, string>
> {
  await requireArea('vendas')
  const rows = await db
    .select({
      descricao: orcamentoItens.descricao,
      preco: orcamentoItens.precoUnitario,
    })
    .from(orcamentoItens)
    .innerJoin(orcamentos, eq(orcamentos.id, orcamentoItens.orcamentoId))
    .where(isNull(orcamentos.deletedAt))
    .orderBy(desc(orcamentoItens.createdAt))
    .limit(500)

  // Mais recente vence (a lista vem desc, então o primeiro fica).
  const mapa: Record<string, string> = {}
  for (const r of rows) {
    if (!(r.descricao in mapa)) mapa[r.descricao] = r.preco
  }
  return mapa
}

// -----------------------------------------------------------------
// Criar / atualizar / excluir
// -----------------------------------------------------------------

export async function criarOrcamentoAction(
  input: OrcamentoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAreaEscrita('vendas')
  const parsed = orcamentoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const novoId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(orcamentos)
      .values({
        cliente: data.cliente,
        compradorId: data.compradorId ?? null,
        observacao: data.observacao ?? null,
        // Frete DIGITADO: entra sem procedência nenhuma (sem transportadora,
        // sem prazo, sem `cotadoEm`). É essa ausência que a tela lê pra dizer
        // "informado à mão" em vez de "cotado" — ver `procedenciaLimpa`.
        freteValor: data.freteValor ?? null,
      })
      .returning({ id: orcamentos.id })

    await tx.insert(orcamentoItens).values(
      data.itens.map((it) => ({
        orcamentoId: inserted!.id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        precoUnitario: it.precoUnitario,
        kitId: it.kitId ?? null,
        produtoId: it.produtoId ?? null,
        tamanho: it.tamanho ?? null,
        kitComponentes: it.componentes ?? null,
      })),
    )
    return inserted!.id
  })

  revalidatePath('/pedidos')
  return { success: true, data: { id: novoId }, message: 'Pedido criado' }
}

export async function atualizarOrcamentoAction(
  id: string,
  input: OrcamentoInput,
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')
  const parsed = orcamentoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select({ id: orcamentos.id, freteValor: orcamentos.freteValor })
    .from(orcamentos)
    .where(and(eq(orcamentos.id, id), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Pedido não encontrado' }

  // MUDOU O VALOR DO FRETE À MÃO ⇒ A PROCEDÊNCIA MORRE JUNTO.
  //
  // Transportadora, serviço, prazo e data da cotação descrevem UM valor: o
  // que a cotação devolveu. Mantê-los ao lado de um número digitado faria a
  // tela dizer "Correios PAC · 5 dias — R$ 80" pra um frete de R$ 80 que
  // ninguém cotou. É a diferença entre estimativa e combinado, que é
  // exatamente o que precisa ficar claro.
  //
  // Salvar o pedido sem mexer no frete não limpa nada: o diálogo devolve o
  // mesmo valor que carregou, e a comparação é em centavos justamente porque
  // "50.00" e "50" são o mesmo dinheiro escrito de dois jeitos.
  const trocouOFrete =
    freteEmCentavos(data.freteValor) !== freteEmCentavos(atual.freteValor)
  const procedenciaLimpa = {
    freteTransportadora: null,
    freteServico: null,
    fretePrazoDias: null,
    freteCotadoEm: null,
    freteCepDestino: null,
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orcamentos)
      .set({
        cliente: data.cliente,
        compradorId: data.compradorId ?? null,
        observacao: data.observacao ?? null,
        freteValor: data.freteValor ?? null,
        ...(trocouOFrete ? procedenciaLimpa : {}),
      })
      .where(eq(orcamentos.id, id))

    // Substitui os itens (simples e seguro, igual aos kits).
    await tx.delete(orcamentoItens).where(eq(orcamentoItens.orcamentoId, id))
    await tx.insert(orcamentoItens).values(
      data.itens.map((it) => ({
        orcamentoId: id,
        descricao: it.descricao,
        quantidade: it.quantidade,
        precoUnitario: it.precoUnitario,
        kitId: it.kitId ?? null,
        produtoId: it.produtoId ?? null,
        tamanho: it.tamanho ?? null,
        kitComponentes: it.componentes ?? null,
      })),
    )
  })

  revalidatePath('/pedidos')
  revalidatePath(`/pedidos/${id}`)
  return { success: true, message: 'Pedido atualizado' }
}

export async function excluirOrcamentoAction(
  id: string,
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')
  const [atual] = await db
    .select({ id: orcamentos.id })
    .from(orcamentos)
    .where(and(eq(orcamentos.id, id), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Pedido não encontrado' }

  await db
    .update(orcamentos)
    .set({ deletedAt: new Date() })
    .where(eq(orcamentos.id, id))

  revalidatePath('/pedidos')
  return { success: true, message: 'Pedido excluído' }
}

// Troca o status do pedido (ação rápida na lista). A transição é livre, mas
// quem decide o que vale é src/lib/pedido-status.ts — o mesmo módulo que monta
// o menu na tela, pra que ela nunca ofereça algo que aqui é recusado.
//
// O `ehStatusPedido` daqui não é redundante com o tipo do parâmetro: server
// action recebe o que o cliente mandar, e `destino: StatusPedido` é promessa
// de compilação, não do runtime.
export async function mudarStatusOrcamentoAction(
  id: string,
  destino: StatusPedido,
): Promise<ActionResult> {
  await requireAreaEscrita('vendas')
  if (!ehStatusPedido(destino)) {
    return { success: false, error: 'Status inválido' }
  }

  const [atual] = await db
    .select({ id: orcamentos.id, status: orcamentos.status })
    .from(orcamentos)
    .where(and(eq(orcamentos.id, id), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Pedido não encontrado' }

  const recusa = erroDeTransicao(atual.status, destino)
  if (recusa) return { success: false, error: recusa }

  await db
    .update(orcamentos)
    .set({ status: destino })
    .where(eq(orcamentos.id, id))

  revalidatePath('/pedidos')
  return {
    success: true,
    message: `Marcado como ${ROTULO_STATUS[destino].toLowerCase()}`,
  }
}
