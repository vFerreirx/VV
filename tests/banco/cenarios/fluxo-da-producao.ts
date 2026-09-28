// O DIA DA PRODUÇÃO, de ponta a ponta, pelas actions de verdade.
//
// Uma OP de estoque (30 peças, máquina 1, ligada a um item de reposição) e
// uma remessa Full ML com duas OPs (20 e 15 peças, máquinas 2 e 3). O
// operador inicia, devolve, conclui, desfaz; o gerente corrige, muda destino
// e despacha. Entre cada ação o relógio anda 1 minuto (relogio.ts).
//
// ⚠️ ACTION NOVA DO FLUXO DA PRODUÇÃO GANHA PASSO AQUI (AGENTS.md, seção
// test:banco). É a única coisa que roda a consulta dela antes do merge.

import type { ItemDoHistorico } from '@/app/(app)/ordens/actions'
import { textoDaCorrecao } from '@/lib/producao/correcao'

import type { Cenario, Contexto } from '../lib/contexto'

export const fluxoDaProducao: Cenario = {
  nome: 'fluxo-da-producao',
  rodar,
}

type ItemDeStatus = Extract<ItemDoHistorico, { tipo: 'status' }>

/** O que toda action de escrita devolve, sem o `data` de cada uma. */
type Resultado = { success: boolean; message?: string; error?: string }

async function rodar(ctx: Contexto) {
  const { elenco, placar: p, fabrica, ler } = ctx
  const { ordens, producao, remessas } = ctx.acoes

  for (const [nome, escolha] of [
    ['operador com 3 máquinas livres', elenco.operador],
    ['gerente', elenco.gerente],
    ['variação de produto', elenco.variacao],
  ] as const) {
    if (escolha.valor === null) {
      p.pular(`o roteiro inteiro (falta ${nome})`, escolha.porque)
      return
    }
  }
  const { usuario: operador, maquinas } = elenco.operador.valor!
  const [m1, m2, m3] = maquinas
  const gerente = elenco.gerente.valor!
  const variacao = elenco.variacao.valor!
  const conta = elenco.contaFullMl.valor

  console.log(
    `  elenco: operador ${operador.nome} (${m1.codigo}, ${m2.codigo}, ${m3.codigo}) · ` +
      `${gerente.role} ${gerente.nome} · ${variacao.rotulo} · ` +
      `conta ${conta?.nome ?? '—'}`,
  )

  // ---------------------------------------------------------------- preparo
  const est = await fabrica.opDeEstoque(variacao, 30, gerente.id)
  const reposicaoId = await fabrica.reposicaoEmProducao(variacao, est.id, gerente.id)
  p.checar(
    `OP de estoque criada, numerada pelo gatilho (${est.numero})`,
    /^OP-\d{4}-\d{4,}$/.test(est.numero),
    est.numero,
  )

  let full: { remessaId: string; a: string; b: string } | null = null
  if (conta) {
    const remessaId = await fabrica.remessaFullMl(conta.id, 5)
    const a = await fabrica.opDaRemessaEmProducao(
      variacao, remessaId, 20, m2.id, operador.id, gerente.id,
    )
    const b = await fabrica.opDaRemessaEmProducao(
      variacao, remessaId, 15, m3.id, operador.id, gerente.id,
    )
    full = { remessaId, a: a.id, b: b.id }
  }
  await ctx.passarUmMinuto()

  // ------------------------------------------- Iniciar e "Peguei errado"
  ctx.como(operador)
  let r: Resultado = await ordens.pegarOrdemAction(est.id, m1.id)
  p.exigir('Iniciar: o operador pega a OP da fila na máquina 1', r.success, r)
  let op = await ler.op(est.id)
  p.checar(
    '  em produção na máquina 1, com ele de dono',
    op.status === 'em_producao' && op.maquinaId === m1.id && op.responsavelId === operador.id,
    op,
  )
  await ctx.passarUmMinuto()

  r = await ordens.devolverOpParaFilaAction(est.id)
  p.exigir('Peguei errado: a OP volta pra fila', r.success, r)
  op = await ler.op(est.id)
  p.checar(
    '  Programado, sem máquina e sem dono; a reposição segue em produção',
    op.status === 'programado' &&
      op.maquinaId === null &&
      op.responsavelId === null &&
      (await ler.reposicao(reposicaoId)).estado === 'em_producao',
    op,
  )
  await ctx.passarUmMinuto()

  r = await ordens.pegarOrdemAction(est.id, m1.id)
  p.exigir('Iniciar de novo na máquina 1', r.success, r)
  await ctx.passarUmMinuto()

  // ---------------------------------------------- 1. não passa da meta
  r = await ordens.concluirProducaoAction(est.id, { produzida: 31, refugo: 0 })
  op = await ler.op(est.id)
  p.checar(
    '1. operador não passa da meta (31 de 30): recusa, e nada muda',
    !r.success &&
      op.status === 'em_producao' &&
      (await ler.apontamentos(est.id)).length === 0,
    r,
  )
  await ctx.passarUmMinuto()

  // --------------------------------------------------- 2. "Terminei"
  r = await ordens.concluirProducaoAction(est.id, { produzida: 28, refugo: 2 })
  p.exigir('2. "Terminei" com 28 boas e 2 com defeito', r.success, r)
  op = await ler.op(est.id)
  p.checar('  finalizada, com data_real_fim', op.status === 'enviado' && op.dataRealFim !== null, op)
  const aps = await ler.apontamentos(est.id)
  p.checar(
    '  1 apontamento 28/2',
    aps.length === 1 && aps[0].boas === 28 && aps[0].defeito === 2,
    aps,
  )
  p.checar('  entrada no estoque = 28', (await ler.estoque(est.id)) === 28)
  const hist = (await ordens.historicoDaOrdem(est.id)).filter(
    (i): i is ItemDeStatus => i.tipo === 'status',
  )
  const iConclusao = hist.findIndex((i) => i.statusNovo === 'pronto_envio')
  const iFinal = hist.findIndex((i) => i.statusNovo === 'enviado')
  p.checar(
    '  histórico: conclusão ("2 com defeito") e finalização no mesmo instante, a finalização por último',
    iConclusao >= 0 &&
      iFinal >= 0 &&
      (hist[iConclusao].observacao ?? '').includes('2 com defeito') &&
      hist[iConclusao].em.getTime() === hist[iFinal].em.getTime() &&
      iFinal < iConclusao,
    hist.slice(0, 3),
  )
  const repo = await ler.reposicao(reposicaoId)
  p.checar(
    '  reposição → reposto, com reposto_em',
    repo.estado === 'reposto' && repo.repostoEm !== null,
    repo,
  )
  await ctx.passarUmMinuto()

  // ------------------------------------------------------- 3. tablet
  const contagens = await producao.contarOpsDaEstacao()
  const terminadas = await producao.listarOpsDaEstacao('terminadas')
  const noTablet = terminadas.ops.find((o) => o.id === est.id)
  p.checar(
    '3. tablet: contagens e Terminadas carregam, com a OP e o Desfazer',
    contagens.ids.includes(est.id) && noTablet?.podeDesfazer === true,
    noTablet ?? contagens,
  )

  // -------------------------------------------------------- 4. quadro
  ctx.como(gerente)
  const quadro = await producao.listarOrdensProducao()
  p.checar(
    '4. quadro carrega e mostra a OP finalizada (janela de 24 h)',
    quadro.some((c) => c.id === est.id && c.status === 'enviado'),
  )

  // ------------------------------------------------------- 5. desfazer
  ctx.como(operador)
  r = await ordens.desfazerConclusaoAction(est.id)
  p.exigir('5. desfazer, pelo mesmo operador', r.success, r)
  op = await ler.op(est.id)
  p.checar(
    '  volta pra máquina 1, sem data_real_fim',
    op.status === 'em_producao' && op.maquinaId === m1.id && op.dataRealFim === null,
    op,
  )
  p.checar(
    '  apontamento e entrada no estoque saem',
    (await ler.apontamentos(est.id)).length === 0 && (await ler.estoque(est.id)) === 0,
  )
  const repoDesfeita = await ler.reposicao(reposicaoId)
  p.checar(
    '  reposição volta pra em_producao',
    repoDesfeita.estado === 'em_producao' && repoDesfeita.repostoEm === null,
    repoDesfeita,
  )
  await ctx.passarUmMinuto()

  // ------------------------------------------------ 6. conclui de novo
  r = await ordens.concluirProducaoAction(est.id, { produzida: 30, refugo: 0 })
  op = await ler.op(est.id)
  p.exigir(
    '6. conclui de novo (30/0): finaliza, estoque = 30',
    r.success && op.status === 'enviado' && (await ler.estoque(est.id)) === 30,
    r,
  )
  const conclusao = (await ler.eventos(est.id)).find((e) => e.para === 'pronto_envio')
  await ctx.passarUmMinuto()

  // ---------------------------------------------- 7. corrigir quantidades
  ctx.como(gerente)
  r = await ordens.corrigirQuantidadesAction(est.id, {
    produzida: 27,
    refugo: 3,
    vistos: { produzida: 30, refugo: 0 },
  })
  p.exigir('7. gerente corrige 30→27 boas e 0→3 com defeito', r.success, r)
  const apsCorrigidos = await ler.apontamentos(est.id)
  p.checar(
    '  apontamento 27/3, estoque 27',
    apsCorrigidos.length === 1 &&
      apsCorrigidos[0].boas === 27 &&
      apsCorrigidos[0].defeito === 3 &&
      (await ler.estoque(est.id)) === 27,
    apsCorrigidos,
  )
  const [ultimo] = await ler.eventos(est.id)
  p.checar(
    '  evento SEM transição, com o texto da correção',
    ultimo.de === ultimo.para &&
      ultimo.observacao === textoDaCorrecao({ boas: 30, defeito: 0 }, { boas: 27, defeito: 3 }),
    ultimo,
  )
  ctx.como(operador)
  const depoisDaCorrecao = (await producao.listarOpsDaEstacao('terminadas')).ops.find(
    (o) => o.id === est.id,
  )
  p.checar(
    '  no tablet, o autor e o resumo continuam os da conclusão',
    depoisDaCorrecao?.concluidaPor === operador.nome &&
      depoisDaCorrecao.resumo === conclusao?.observacao,
    { tablet: depoisDaCorrecao?.resumo, conclusao: conclusao?.observacao },
  )
  await ctx.passarUmMinuto()

  // ------------------------------------------------------- Full ML
  if (!full) {
    p.pular('8 a 11 (Full ML)', elenco.contaFullMl.porque ?? 'sem conta')
  } else {
    // 8. Full concluída espera o despacho
    r = await ordens.concluirProducaoAction(full.a, { produzida: 20, refugo: 0 })
    op = await ler.op(full.a)
    p.checar(
      '8. Full concluída fica em pronto_envio, sem estoque',
      r.success && op.status === 'pronto_envio' && (await ler.estoque(full.a)) === 0,
      r,
    )
    await ctx.passarUmMinuto()

    // 9. mudar destino pra Estoque
    ctx.como(gerente)
    r = await ordens.mudarDestinoDaOrdemAction(full.a, { tipo: 'estoque' })
    op = await ler.op(full.a)
    p.checar(
      '9. Full pronta muda o destino pra Estoque: canal estoque, sem remessa, finalizada, estoque = 20',
      r.success &&
        op.canalDestino === 'estoque' &&
        op.remessaFullId === null &&
        op.status === 'enviado' &&
        (await ler.estoque(full.a)) === 20,
      { r, op },
    )
    await ctx.passarUmMinuto()

    // 10. a outra Full, concluída, espera o despacho
    ctx.como(operador)
    r = await ordens.concluirProducaoAction(full.b, { produzida: 15, refugo: 0 })
    op = await ler.op(full.b)
    p.checar(
      '10. a outra Full, concluída, espera o despacho',
      r.success &&
        op.status === 'pronto_envio' &&
        (r.message ?? '').includes('espera o despacho'),
      r,
    )
    await ctx.passarUmMinuto()

    // 11. despachar
    ctx.como(gerente)
    r = await remessas.despacharRemessaAction(full.remessaId)
    op = await ler.op(full.b)
    p.checar(
      '11. despachar a remessa: finaliza, sem estoque',
      r.success && op.status === 'enviado' && (await ler.estoque(full.b)) === 0,
      { r, op },
    )
    await ctx.passarUmMinuto()
  }

  // ------------------------------------------ 12. leituras depois de tudo
  ctx.como(gerente)
  const ids = full ? [est.id, full.a, full.b] : [est.id]
  const quadroFinal = await producao.listarOrdensProducao()
  p.checar(
    `12. o quadro mostra ${full ? 'as três' : 'a OP'}`,
    ids.every((id) => quadroFinal.some((c) => c.id === id)),
  )
  if (full) {
    const despachadas = await remessas.listarRemessasDespachadas()
    p.checar(
      '  a remessa aparece nas Despachadas',
      despachadas.some((d) => d.id === full.remessaId),
    )
  }
  let leiturasOk = true
  for (const id of ids) {
    const [h, ficha] = await Promise.all([ordens.historicoDaOrdem(id), ordens.obterOrdem(id)])
    if (h.length === 0 || ficha === null) leiturasOk = false
  }
  p.checar('  o histórico e a ficha (obterOrdem) carregam', leiturasOk)
}
