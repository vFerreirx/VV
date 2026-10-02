// A REPOSIÇÃO COM QUANTIDADE (Q200–Q202), pela action de verdade
// (`marcarReposicaoAction`), com a transação desfeita no fim.
//
//   d) a estoquista marca 2 peças com quantidade → itens abertos, sem OP
//      (e, pedindo `criarOps`, é barrada: não escreve em Ordens)
//   a) o gerente marca 3 peças novas (acabou e acabando) + 1 das abertas da
//      estoquista → 4 OPs de canal Estoque, com a quantidade e a prioridade
//      da situação, e os itens em produção e ligados a elas
//   b) peça já em produção → nada novo
//   c) peça de produto de PARCEIRO → item com a quantidade, sem OP
//   e) quantidade vazia ou 0 → recusa, e nada é gravado
//   f) uma OP do lote falha → NENHUMA fica, e nenhum item muda (tudo ou nada)
//
// A d) vem antes da a) de propósito: é ela que deixa o item ABERTO sem OP
// que o gerente marca de novo — o caso "ligar_op_ao_item" da regra.
//
// ⚠️ O f) CRIA UM TRIGGER DENTRO DA TRANSAÇÃO DO TESTE, que recusa o INSERT
// da OP de uma variação escolhida. DDL no Postgres é transacional: o trigger
// some no rollback do cenário (e é derrubado logo depois do passo, de
// qualquer jeito). Enquanto existe, trava escrita em `ordens_producao` — o
// cenário inteiro dura segundos.

import { and, asc, eq, inArray, isNull, notExists, sql } from 'drizzle-orm'

import type { AuthUser } from '@/lib/auth/get-user'
import {
  ordensProducao,
  produtos,
  reposicoesEstoque,
  users,
  variacoesProduto,
} from '@/lib/db/schema'
import { ESTADOS_ATIVOS_DE_REPOSICAO } from '@/lib/producao/reposicao'

import type { Cenario, Contexto } from '../lib/contexto'
import { Redirecionou } from '../lib/mocks'
import { MARCA } from '../lib/retrato'

export const reposicaoComQuantidade: Cenario = {
  nome: 'reposicao-com-quantidade',
  rodar,
}

type Tx = Contexto['tx']

/** Variações LIVRES (sem item ativo na fila) de um produto da origem pedida. */
async function produtoComLivres(tx: Tx, origem: 'producao' | 'parceiro', minimo: number) {
  const livres = await tx
    .select({
      produtoId: produtos.id,
      produtoNome: produtos.nome,
      variacaoId: variacoesProduto.id,
    })
    .from(variacoesProduto)
    .innerJoin(produtos, eq(produtos.id, variacoesProduto.produtoId))
    .where(
      and(
        eq(produtos.ativo, true),
        isNull(produtos.deletedAt),
        eq(produtos.origem, origem),
        isNull(variacoesProduto.deletedAt),
        notExists(
          tx
            .select({ um: sql`1` })
            .from(reposicoesEstoque)
            .where(
              and(
                eq(reposicoesEstoque.variacaoId, variacoesProduto.id),
                inArray(reposicoesEstoque.estado, [...ESTADOS_ATIVOS_DE_REPOSICAO]),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(produtos.nome), asc(variacoesProduto.skuVariacao))
  const porProduto = new Map<string, typeof livres>()
  for (const l of livres) porProduto.set(l.produtoId, [...(porProduto.get(l.produtoId) ?? []), l])
  for (const lista of porProduto.values()) {
    if (lista.length >= minimo) return lista
  }
  return null
}

async function rodar(ctx: Contexto) {
  const { placar: p, tx, elenco } = ctx
  const { marcarReposicaoAction } = ctx.acoes.estoque

  if (!elenco.gerente.valor) {
    p.pular('o roteiro inteiro', elenco.gerente.porque)
    return
  }
  const gerente = elenco.gerente.valor
  const pecas = await produtoComLivres(tx, 'producao', 7)
  if (!pecas) {
    p.pular('o roteiro inteiro', 'nenhum produto de produção com 7 variações fora da fila')
    return
  }
  const produtoId = pecas[0]!.produtoId
  const [v1, v2, v3, v4, v5, v6, v7] = pecas.map((x) => x.variacaoId) as [
    string, string, string, string, string, string, string,
  ]
  console.log(`  elenco: gerente ${gerente.nome} · produto ${pecas[0]!.produtoNome}`)

  // A ESTOQUISTA: uma de verdade, se houver; senão um usuário ativo qualquer
  // com o cargo trocado SÓ no mock de autenticação (a FK de `marcado_por`
  // pede um usuário que exista).
  const [estoquistaReal] = await tx
    .select()
    .from(users)
    .where(and(eq(users.role, 'estoquista'), eq(users.ativo, true), isNull(users.deletedAt)))
    .limit(1)
  const estoquista: AuthUser = estoquistaReal
    ? { ...estoquistaReal, authEmail: estoquistaReal.email }
    : { ...gerente, role: 'estoquista' }
  console.log(
    `  estoquista: ${estoquistaReal ? estoquista.nome : `${gerente.nome} com o cargo trocado no mock (nenhuma estoquista ativa)`}`,
  )

  const item = async (variacaoId: string) => {
    const [r] = await tx
      .select({
        id: reposicoesEstoque.id,
        estado: reposicoesEstoque.estado,
        situacao: reposicoesEstoque.situacao,
        quantidade: reposicoesEstoque.quantidade,
        ordemId: reposicoesEstoque.ordemId,
        observacao: reposicoesEstoque.observacao,
      })
      .from(reposicoesEstoque)
      .where(
        and(
          eq(reposicoesEstoque.variacaoId, variacaoId),
          inArray(reposicoesEstoque.estado, [...ESTADOS_ATIVOS_DE_REPOSICAO]),
        ),
      )
      .limit(1)
    return r ?? null
  }
  const op = async (id: string | null) => {
    if (!id) return null
    const [r] = await tx
      .select({
        id: ordensProducao.id,
        numero: ordensProducao.numero,
        canal: ordensProducao.canalDestino,
        quantidade: ordensProducao.quantidade,
        prioridade: ordensProducao.prioridade,
        status: ordensProducao.status,
        variacaoId: ordensProducao.variacaoId,
        prazo: ordensProducao.dataPrevistaFim,
        observacoes: ordensProducao.observacoes,
      })
      .from(ordensProducao)
      .where(eq(ordensProducao.id, id))
    return r ?? null
  }
  const opsDoProduto = async () =>
    (
      await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(ordensProducao)
        .where(eq(ordensProducao.produtoId, produtoId))
    )[0]!.n

  // ── d) a estoquista ────────────────────────────────────────────────
  p.titulo('  d) a estoquista marca com quantidade, sem OP')
  ctx.como(estoquista)
  let barrada = false
  try {
    await marcarReposicaoAction({
      produtoId,
      marcacoes: [{ variacaoId: v4, situacao: 'acabando', quantidade: 10 }],
      criarOps: true,
    })
  } catch (e) {
    barrada = e instanceof Redirecionou
  }
  p.checar('pedindo criarOps, é barrada (não escreve em Ordens)', barrada)
  p.checar('…e nada foi gravado', (await item(v4)) === null)

  const opsAntesD = await opsDoProduto()
  const rd = await marcarReposicaoAction({
    produtoId,
    marcacoes: [
      { variacaoId: v4, situacao: 'acabando', quantidade: '12' },
      { variacaoId: v5, situacao: 'acabou', quantidade: 8 },
    ],
    observacao: MARCA,
    criarOps: false,
  })
  p.exigir('marcou', rd.success, rd)
  const [i4, i5] = [await item(v4), await item(v5)]
  p.checar(
    'os dois itens abertos, com a quantidade, sem OP',
    i4?.estado === 'aberto' && i4.quantidade === 12 && i4.ordemId === null &&
      i5?.estado === 'aberto' && i5.quantidade === 8 && i5.ordemId === null,
    { i4, i5 },
  )
  p.checar('nenhuma OP nova', (await opsDoProduto()) === opsAntesD)

  // ── a) o gerente marca e cria as OPs ───────────────────────────────
  p.titulo('  a) o gerente marca com quantidade e cria as OPs')
  ctx.como(gerente)
  const opsAntesA = await opsDoProduto()
  const ra = await marcarReposicaoAction({
    produtoId,
    marcacoes: [
      { variacaoId: v1, situacao: 'acabou', quantidade: 30 },
      { variacaoId: v2, situacao: 'acabando', quantidade: 20 },
      { variacaoId: v3, situacao: 'acabou', quantidade: '15' },
      // A aberta da estoquista: a quantidade de agora vence, e a OP sai.
      { variacaoId: v4, situacao: 'acabou', quantidade: 25 },
    ],
    observacao: 'não pode ir pra OP',
    criarOps: true,
  })
  p.exigir('marcou', ra.success, ra)
  console.log(`  aviso: "${ra.success ? ra.message : ''}"`)
  p.checar('4 OPs novas', (await opsDoProduto()) === opsAntesA + 4)
  const esperado = [
    { v: v1, qtd: 30, prioridade: 'alta' },
    { v: v2, qtd: 20, prioridade: 'normal' },
    { v: v3, qtd: 15, prioridade: 'alta' },
    { v: v4, qtd: 25, prioridade: 'alta' },
  ] as const
  const numeros: string[] = []
  for (const e of esperado) {
    const i = await item(e.v)
    const o = await op(i?.ordemId ?? null)
    if (o) numeros.push(o.numero)
    p.checar(
      `peça ${e.qtd}: item em produção, ligado a uma OP Estoque · ${e.qtd} · ${e.prioridade} · Programado, sem prazo e sem observação`,
      i?.estado === 'em_producao' &&
        i.quantidade === e.qtd &&
        o !== null &&
        o.variacaoId === e.v &&
        o.canal === 'estoque' &&
        o.quantidade === e.qtd &&
        o.prioridade === e.prioridade &&
        o.status === 'programado' &&
        o.prazo === null &&
        o.observacoes === null,
      { i, o },
    )
  }
  const i4depois = await item(v4)
  p.checar(
    'o item aberto da estoquista é o MESMO, com a observação dela',
    i4depois?.id === i4?.id && i4depois?.observacao === MARCA,
    i4depois,
  )
  p.checar(
    'a mensagem diz "4 OPs criadas" e a faixa dos números',
    ra.success &&
      (ra.message ?? '').startsWith('4 OPs criadas — ') &&
      ra.data!.ops.length === 4 &&
      numeros.every((n) => ra.data!.ops.includes(n)),
    ra.success ? ra.message : ra,
  )

  // ── b) peça já em produção ─────────────────────────────────────────
  p.titulo('  b) peça já em produção: nada novo')
  const opsAntesB = await opsDoProduto()
  const i1antes = await item(v1)
  const rb = await marcarReposicaoAction({
    produtoId,
    marcacoes: [{ variacaoId: v1, situacao: 'acabou', quantidade: 99 }],
    criarOps: true,
  })
  const i1depois = await item(v1)
  p.checar(
    'sucesso, "1 já estava em produção", nenhuma OP nova',
    rb.success &&
      rb.data!.jaEmProducao === 1 &&
      rb.data!.ops.length === 0 &&
      (await opsDoProduto()) === opsAntesB,
    rb,
  )
  p.checar(
    'o item não mudou (nem a quantidade)',
    i1depois?.id === i1antes?.id &&
      i1depois?.quantidade === 30 &&
      i1depois?.ordemId === i1antes?.ordemId,
    i1depois,
  )

  // ── c) produto de parceiro ─────────────────────────────────────────
  p.titulo('  c) produto de parceiro: item com quantidade, sem OP')
  const doParceiro = await produtoComLivres(tx, 'parceiro', 1)
  if (!doParceiro) {
    p.pular('c)', 'nenhum produto de parceiro com variação fora da fila')
  } else {
    const vp = doParceiro[0]!
    const rc = await marcarReposicaoAction({
      produtoId: vp.produtoId,
      marcacoes: [{ variacaoId: vp.variacaoId, situacao: 'acabou', quantidade: 20 }],
      observacao: MARCA,
      criarOps: true,
    })
    const ip = await item(vp.variacaoId)
    p.checar(
      `${vp.produtoNome}: item aberto com 20, sem OP`,
      rc.success && rc.data!.ops.length === 0 &&
        ip?.estado === 'aberto' && ip.quantidade === 20 && ip.ordemId === null,
      { rc, ip },
    )
    const [opsDoParceiro] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(ordensProducao)
      .where(eq(ordensProducao.variacaoId, vp.variacaoId))
    p.checar('nenhuma OP pra variação do parceiro', opsDoParceiro!.n === 0, opsDoParceiro)
  }

  // ── e) quantidade vazia ou 0 ───────────────────────────────────────
  p.titulo('  e) quantidade vazia ou 0: recusa')
  for (const quantidade of ['', 0, '0', '2,5'] as const) {
    const re = await marcarReposicaoAction({
      produtoId,
      marcacoes: [
        { variacaoId: v6, situacao: 'acabou', quantidade: 5 },
        { variacaoId: v7, situacao: 'acabou', quantidade },
      ],
      criarOps: true,
    })
    p.checar(
      `quantidade ${JSON.stringify(quantidade)}: recusada, e nem a peça boa entrou`,
      !re.success && (await item(v6)) === null && (await item(v7)) === null,
      re,
    )
  }

  // ── f) tudo ou nada ────────────────────────────────────────────────
  p.titulo('  f) uma OP do lote falha: nenhuma fica')
  // A 2ª peça do lote (v7) estoura no INSERT da OP. A 1ª (v6) já terá o
  // item e a OP gravados quando isso acontecer — é o que prova o rollback.
  await tx.execute(sql.raw(`
    CREATE FUNCTION pg_temp.test_banco_recusa_op() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.variacao_id = '${v7}'::uuid THEN
        RAISE EXCEPTION 'test:banco: OP recusada de propósito';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER test_banco_recusa_op BEFORE INSERT ON public.ordens_producao
      FOR EACH ROW EXECUTE FUNCTION pg_temp.test_banco_recusa_op();
  `))
  const opsAntesF = await opsDoProduto()
  let estourou: unknown = null
  try {
    await marcarReposicaoAction({
      produtoId,
      marcacoes: [
        { variacaoId: v6, situacao: 'acabou', quantidade: 5 },
        { variacaoId: v7, situacao: 'acabando', quantidade: 6 },
      ],
      criarOps: true,
    })
  } catch (e) {
    estourou = e
  } finally {
    await tx.execute(sql`DROP TRIGGER test_banco_recusa_op ON public.ordens_producao`)
  }
  p.checar(
    'a action estourou com o erro da OP',
    estourou instanceof Error &&
      /recusada de prop/.test(`${estourou.message} ${String(estourou.cause)}`),
    estourou,
  )
  p.checar(
    'nenhuma OP nova, e nem o item da 1ª peça ficou',
    (await opsDoProduto()) === opsAntesF && (await item(v6)) === null && (await item(v7)) === null,
  )
}
