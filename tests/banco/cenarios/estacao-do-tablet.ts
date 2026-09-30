// A ESTAÇÃO É DO TABLET (PR #16), pelas actions de verdade.
//
// O operador não pertence a estação nenhuma: qualquer um age em qualquer
// máquina, de qualquer tablet. A estação é do APARELHO (cookie, que só o
// gerente grava em "Este aparelho") e só ORGANIZA a tela. Este roteiro é o
// que passou em 30/09 (18/18, nada gravado), rodado de fora do projeto antes
// de o #16 entrar:
//
//   a) operador não define a estação do aparelho; gerente define
//   b) aparelho na casa: a tela abre na casa, e a Fila é comum
//   c) "Em qual máquina?" oferece máquina de todas as estações
//   d) operador inicia na máquina de FORA, sem recusa
//   e) "Máquina parou" e "Voltou" na de fora: a parada abre e fecha
//   f) "Terminei" na de fora: finaliza
//   g) a OP cai nas Terminadas da aba de FORA, não na da casa
//   h) "Quem é você?" lista todo operador ativo, e só operador
//   i) o cartão do quadro leva a estação e a cor da MÁQUINA
//   j) cadastro de estações e /ordens do operador carregam
//   k) aparelho sem estação: tela 'todas', e sem "Você está cobrindo?"
//
// ⚠️ ESTAÇÃO POR ID, NUNCA POR NOME: o nome é o que o gerente mais muda.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { estacoes, maquinaParadas, users } from '@/lib/db/schema'
import { avisoDeCobertura } from '@/lib/producao/cobertura'

import type { Cenario, Contexto } from '../lib/contexto'

export const estacaoDoTablet: Cenario = {
  nome: 'estacao-do-tablet',
  rodar,
}

/** O que toda action de escrita devolve, sem o `data` de cada uma. */
type Resultado = { success: boolean; message?: string; error?: string }

async function rodar(ctx: Contexto) {
  const { elenco, placar: p, fabrica, ler, tx } = ctx
  const { ordens, producao, maquinas, estacoes: cadastro, esteAparelho, login } =
    ctx.acoes

  for (const [nome, escolha] of [
    ['operador ativo', elenco.operador],
    ['duas estações (casa e fora)', elenco.estacoes],
    ['gerente', elenco.gerente],
    ['variação de produto', elenco.variacao],
  ] as const) {
    if (escolha.valor === null) {
      p.pular(`o roteiro inteiro (falta ${nome})`, escolha.porque)
      return
    }
  }
  const operador = elenco.operador.valor!
  const { casa, fora } = elenco.estacoes.valor!
  const mFora = fora.maquina
  const gerente = elenco.gerente.valor!
  const variacao = elenco.variacao.valor!

  console.log(
    `  elenco: operador ${operador.nome} · casa ${casa.maquinas.map((m) => m.codigo).join(', ')} · ` +
      `fora ${mFora.codigo} · ${gerente.role} ${gerente.nome} · ${variacao.rotulo}`,
  )

  // ------------------------------------------------ a) "Este aparelho"
  ctx.como(operador)
  let r: Resultado = await esteAparelho.definirEstacaoDoAparelhoAction(casa.id)
  p.checar(
    'a) operador NÃO define a estação do aparelho, e o cookie não muda',
    !r.success && ctx.estacaoNoAparelho() === null,
    r,
  )

  ctx.como(gerente)
  r = await esteAparelho.definirEstacaoDoAparelhoAction(casa.id)
  p.exigir(
    '  o gerente define: o aparelho fica na casa',
    r.success && ctx.estacaoNoAparelho() === casa.id,
    r,
  )
  const paraAparelho = await esteAparelho.listarEstacoesParaAparelho()
  const casaNaLista = paraAparelho.find((e) => e.id === casa.id)
  const foraNaLista = paraAparelho.find((e) => e.id === fora.id)
  p.checar(
    '  "Este aparelho" lista as estações com os códigos das máquinas',
    casa.maquinas.every((m) => casaNaLista?.maquinas.includes(m.codigo)) &&
      foraNaLista?.maquinas.includes(mFora.codigo) === true,
    { casa: casaNaLista, fora: foraNaLista },
  )

  // ---------------------------------------- b) a tela abre na casa
  ctx.como(operador)
  const tela = await ctx.telaDoTablet()
  p.exigir(
    'b) com o aparelho na casa, a tela abre na casa',
    tela.tipo === 'estacao' && tela.id === casa.id,
    tela,
  )
  const naCasa = await producao.listarMaquinasDaEstacao(tela)
  p.checar(
    '  só máquinas da casa na tela',
    naCasa.length > 0 && naCasa.every((m) => m.estacao?.id === casa.id),
    naCasa.map((m) => `${m.codigo}:${m.estacao?.id ?? '—'}`),
  )

  const op = await fabrica.opDeEstoque(variacao, 10, gerente.id)
  const telaFora = await ctx.telaDoTablet(fora.id)
  const [contaCasa, contaFora] = await Promise.all([
    producao.contarOpsDaEstacao(tela),
    producao.contarOpsDaEstacao(telaFora),
  ])
  p.checar(
    '  OP nova sem máquina conta na Fila da casa E na de fora (a fila é comum)',
    contaCasa.ids.includes(op.id) && contaFora.ids.includes(op.id),
    { casa: contaCasa.fila, fora: contaFora.fila },
  )
  await ctx.passarTempo()

  // ------------------------------------- c) "Em qual máquina?"
  const paraPegar = await ordens.listarMaquinasParaPegar()
  p.checar(
    'c) "Em qual máquina?" oferece a máquina de fora e as da casa',
    paraPegar.success &&
      paraPegar.data !== undefined &&
      paraPegar.data.maquinas.some((m) => m.id === mFora.id) &&
      casa.maquinas.every((c) => paraPegar.data!.maquinas.some((m) => m.id === c.id)),
    paraPegar.success ? paraPegar.data?.maquinas.length : paraPegar,
  )

  // --------------------------------- d) Iniciar na máquina de FORA
  r = await ordens.pegarOrdemAction(op.id, mFora.id)
  p.exigir(`d) operador inicia a OP na ${mFora.codigo}, de outra estação`, r.success, r)
  let estado = await ler.op(op.id)
  p.checar(
    '  em produção na máquina de fora, com ele de dono',
    estado.status === 'em_producao' &&
      estado.maquinaId === mFora.id &&
      estado.responsavelId === operador.id,
    estado,
  )
  await ctx.passarTempo()

  // ------------------------------------- e) Parou e Voltou
  r = await maquinas.trocarStatusAction(mFora.id, {
    status: 'manutencao',
    motivo: 'quebra',
  })
  p.exigir('e) "Máquina parou" (quebra) na máquina de fora', r.success, r)
  const abertas = await paradasAbertas(tx, mFora.id)
  p.checar(
    '  uma parada aberta, por ele, com motivo quebra',
    abertas.length === 1 &&
      abertas[0].abertaPor === operador.id &&
      abertas[0].motivo === 'quebra',
    abertas,
  )
  await ctx.passarTempo()

  r = await maquinas.trocarStatusAction(mFora.id, { status: 'operando' })
  p.exigir('  "Voltou" na máquina de fora', r.success, r)
  const [fechada] = abertas.length
    ? await tx
        .select({
          iniciadaEm: maquinaParadas.iniciadaEm,
          encerradaEm: maquinaParadas.encerradaEm,
          encerradaPor: maquinaParadas.encerradaPor,
        })
        .from(maquinaParadas)
        .where(eq(maquinaParadas.id, abertas[0].id))
    : []
  p.checar(
    '  a parada fecha, por ele, e termina depois de começar',
    (await paradasAbertas(tx, mFora.id)).length === 0 &&
      fechada?.encerradaPor === operador.id &&
      fechada.encerradaEm !== null &&
      fechada.encerradaEm >= fechada.iniciadaEm,
    fechada,
  )
  await ctx.passarTempo()

  // ------------------------------------------- f) Terminei
  r = await ordens.concluirProducaoAction(op.id, { produzida: 10, refugo: 0 })
  p.exigir('f) "Terminei" na máquina de fora', r.success, r)
  estado = await ler.op(op.id)
  p.checar(
    '  finalizada, no canal estoque, com a entrada',
    estado.status === 'enviado' &&
      estado.canalDestino === 'estoque' &&
      (await ler.estoque(op.id)) === 10,
    estado,
  )
  await ctx.passarTempo()

  // ------------------------------- g) Terminadas seguem a máquina
  const [terminadasFora, terminadasCasa] = await Promise.all([
    producao.listarOpsDaEstacao('terminadas', telaFora),
    producao.listarOpsDaEstacao('terminadas', tela),
  ])
  p.checar(
    'g) a OP está nas Terminadas da aba de FORA, e não nas da casa',
    terminadasFora.ops.some((o) => o.id === op.id) &&
      !terminadasCasa.ops.some((o) => o.id === op.id),
    { fora: terminadasFora.total, casa: terminadasCasa.total },
  )

  // --------------------------------------- h) "Quem é você?"
  const naTroca = await login.listarOperadoresParaTroca()
  const [{ ativos }] = await tx
    .select({ ativos: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(eq(users.role, 'operador'), eq(users.ativo, true), isNull(users.deletedAt)),
    )
  const cargos = naTroca.length
    ? await tx
        .select({ role: users.role })
        .from(users)
        .where(inArray(users.id, naTroca.map((o) => o.id)))
    : []
  p.checar(
    `h) "Quem é você?" lista os ${ativos} operadores ativos, e nenhum admin ou gerente`,
    naTroca.length === ativos && cargos.every((c) => c.role === 'operador'),
    { lista: naTroca.length, ativos, cargos: [...new Set(cargos.map((c) => c.role))] },
  )

  // ----------------------------- i) o cartão leva a estação da MÁQUINA
  ctx.como(gerente)
  const [daFora] = await tx
    .select({ nome: estacoes.nome, cor: estacoes.cor })
    .from(estacoes)
    .where(eq(estacoes.id, fora.id))
  const cartao = (await producao.listarOrdensProducao()).find((c) => c.id === op.id)
  p.checar(
    'i) no quadro, o cartão vem com a estação e a cor da máquina de fora',
    cartao !== undefined &&
      cartao.maquinaId === mFora.id &&
      cartao.estacaoNome === daFora.nome &&
      cartao.estacaoCor === daFora.cor,
    { cartao: cartao && [cartao.estacaoNome, cartao.estacaoCor], estacao: daFora },
  )

  // ------------------------------- j) cadastro e /ordens carregam
  const lista = await cadastro.listarEstacoes()
  p.checar(
    'j) o cadastro de estações carrega, com a máquina de fora na estação dela',
    lista.find((e) => e.id === fora.id)?.maquinaIds.includes(mFora.id) === true,
  )
  ctx.como(operador)
  const pagina = await ordens.listarOrdens({ status: 'todos' })
  p.checar(
    '  a /ordens do operador carrega',
    Array.isArray(pagina.ordens) && pagina.total >= pagina.ordens.length,
    pagina.total,
  )

  // ----------------------------------- k) aparelho sem estação
  const naFora = (await producao.listarMaquinasDaEstacao(telaFora)).find(
    (m) => m.id === mFora.id,
  )
  p.checar(
    'k) (antes) com o aparelho na casa, a máquina de fora pede "Você está cobrindo?"',
    naFora !== undefined &&
      avisoDeCobertura(naFora, { id: casa.id, nome: '' }) !== null,
    naFora?.estacao,
  )
  ctx.noAparelho(null)
  const semEstacao = await ctx.telaDoTablet()
  const todas = await producao.listarMaquinasDaEstacao(semEstacao)
  const deFora = todas.find((m) => m.id === mFora.id)
  p.checar(
    '  aparelho SEM estação: a tela é "todas", com a casa e a de fora',
    semEstacao.tipo === 'todas' &&
      deFora !== undefined &&
      casa.maquinas.every((c) => todas.some((m) => m.id === c.id)),
    { tela: semEstacao, maquinas: todas.length },
  )
  p.checar(
    '  e nenhum "Você está cobrindo?"',
    deFora !== undefined && avisoDeCobertura(deFora, null) === null,
  )
}

function paradasAbertas(tx: Contexto['tx'], maquinaId: string) {
  return tx
    .select({
      id: maquinaParadas.id,
      motivo: maquinaParadas.motivo,
      abertaPor: maquinaParadas.abertaPor,
    })
    .from(maquinaParadas)
    .where(
      and(eq(maquinaParadas.maquinaId, maquinaId), isNull(maquinaParadas.encerradaEm)),
    )
}
