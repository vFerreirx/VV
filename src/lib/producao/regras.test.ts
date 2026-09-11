// Testes das regras puras da produção. Rodam com o runner embutido do Node,
// sem dependência nova:
//
//     node --test --experimental-strip-types src/lib/producao/regras.test.ts
//
// Os três módulos aqui são de propósito SEM BANCO e SEM REACT — é o que
// permite testá-los assim, direto, e é o motivo de eles existirem separados
// das actions e das telas.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  calcularConclusao,
  erroDeQuantidade,
  resumoDaConclusao,
} from './conclusao.ts'
import { destinoDaOrdem } from './destino-da-ordem.ts'
import {
  agruparPorModelo,
  destaqueDaVariacao,
  familiaDoProduto,
  prazoEmPalavras,
  SEM_MODELO,
  tituloDaOp,
} from './rotulo-da-op.ts'
import { estadoDaMaquina, motivoDeImpedimento } from './estado-maquina.ts'
import {
  confirmacaoAntesDeIniciar,
  podeIniciar,
  STATUS_QUE_INICIAM,
} from './inicio-da-op.ts'

// -----------------------------------------------------------------
// O cartão da máquina
// -----------------------------------------------------------------

test('ocupada sai da OP, não do cadastro da máquina', () => {
  // As 18 máquinas do banco estão TODAS em 'operando' e 17 não têm OP.
  // Se 'operando' fosse "produzindo", a estação inteira apareceria ocupada.
  assert.equal(estadoDaMaquina('operando', false), 'livre')
  assert.equal(estadoDaMaquina('operando', true), 'ocupada')
})

test('ocupada vence indisponível, e não o contrário', () => {
  // Máquina rodando uma OP mas marcada em manutenção no cadastro mostra a
  // OP. Esconder o trabalho real por causa de cadastro velho seria mentir
  // pra quem está de pé na frente dela.
  assert.equal(estadoDaMaquina('manutencao', true), 'ocupada')
  assert.equal(estadoDaMaquina('manutencao', false), 'indisponivel')
})

test('parada e setup contam como LIVRE', () => {
  // São estados momentâneos de uma máquina que pode receber trabalho agora.
  assert.equal(estadoDaMaquina('parada', false), 'livre')
  assert.equal(estadoDaMaquina('setup', false), 'livre')
})

test('só manutenção e desativada impedem, e cada uma tem frase', () => {
  assert.equal(motivoDeImpedimento('manutencao'), 'está em manutenção')
  assert.equal(motivoDeImpedimento('desativada'), 'está desativada')
  assert.equal(motivoDeImpedimento('operando'), null)
  assert.equal(motivoDeImpedimento('parada'), null)
  assert.equal(motivoDeImpedimento('setup'), null)
})

// -----------------------------------------------------------------
// Onde cada OP aparece
// -----------------------------------------------------------------

test('a máquina vence o status', () => {
  assert.equal(destinoDaOrdem('em_producao', true), 'maquina')
})

test('em produção SEM máquina cai na fila, não some', () => {
  // O gerente pode arrastar o card pra "Em produção" sem escolher máquina.
  // Se isso não tivesse destino, a OP ficaria presa e invisível pra sempre.
  assert.equal(destinoDaOrdem('em_producao', false), 'fila')
})

test('as três que saíram da máquina esperam o gerente', () => {
  assert.equal(destinoDaOrdem('acabamento', false), 'terminadas')
  assert.equal(destinoDaOrdem('embalagem', false), 'terminadas')
  assert.equal(destinoDaOrdem('pronto_envio', false), 'terminadas')
})

test('enviado e cancelado somem — mas por decisão escrita', () => {
  assert.equal(destinoDaOrdem('enviado', false), 'fora')
  assert.equal(destinoDaOrdem('cancelado', false), 'fora')
})

test('todo status tem exatamente um destino', () => {
  const todos = [
    'aguardando_materia_prima',
    'programado',
    'em_producao',
    'acabamento',
    'embalagem',
    'pronto_envio',
    'enviado',
    'cancelado',
  ] as const
  for (const s of todos) {
    assert.ok(
      ['maquina', 'fila', 'terminadas', 'fora'].includes(
        destinoDaOrdem(s, false),
      ),
      `${s} ficou sem destino`,
    )
  }
})

// -----------------------------------------------------------------
// O que pode entrar numa máquina
// -----------------------------------------------------------------

test('a lista que a tela mostra é a que a action aceita', () => {
  // Divergir aqui produz um de dois estragos: a tela oferece o que o
  // servidor recusa, ou o servidor aceita o que a tela nunca mostraria.
  for (const s of STATUS_QUE_INICIAM) {
    assert.ok(podeIniciar(s), `${s} está na lista mas podeIniciar recusa`)
  }
})

test('OP que já saiu da máquina não volta pra ela', () => {
  assert.equal(podeIniciar('acabamento'), false)
  assert.equal(podeIniciar('embalagem'), false)
  assert.equal(podeIniciar('pronto_envio'), false)
  assert.equal(podeIniciar('enviado'), false)
  assert.equal(podeIniciar('cancelado'), false)
})

test('só aguardando matéria-prima faz a pergunta', () => {
  assert.equal(
    confirmacaoAntesDeIniciar('aguardando_materia_prima'),
    'Esta OP está aguardando matéria-prima. O fio já está na máquina?',
  )
  assert.equal(confirmacaoAntesDeIniciar('programado'), null)
  assert.equal(confirmacaoAntesDeIniciar('em_producao'), null)
})

test('status que nem inicia não faz pergunta nenhuma', () => {
  // Sem isto, uma OP em pronto_envio abriria o diálogo da matéria-prima
  // antes de a action recusá-la por status — pergunta sem consequência.
  assert.equal(confirmacaoAntesDeIniciar('pronto_envio'), null)
  assert.equal(confirmacaoAntesDeIniciar('cancelado'), null)
})

// -----------------------------------------------------------------
// Concluir a produção
// -----------------------------------------------------------------

test('sem registro anterior, o sugerido e o teto sao a meta', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(c.restante, 30)
  assert.equal(erroDeQuantidade(30, 0, c), null)
})

test('NAO passa da meta do gerente', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(
    erroDeQuantidade(31, 0, c),
    'A OP é de 30 peças. Não dá pra registrar mais que isso.',
  )
})

test('refugo NAO entra no teto', () => {
  // Fio ruim pode queimar mais peças do que a meta inteira. Tampar o refugo
  // faria o operador arredondar pra baixo pra conseguir salvar.
  const c = calcularConclusao(30, 0)
  assert.equal(erroDeQuantidade(30, 99, c), null)
})

test('com registro anterior, o teto e o que FALTA', () => {
  const c = calcularConclusao(30, 12)
  assert.equal(c.restante, 18)
  assert.equal(erroDeQuantidade(18, 0, c), null)
  assert.equal(
    erroDeQuantidade(19, 0, c),
    'A OP é de 30 peças e 12 já foram registradas — o máximo agora é 18',
  )
})

test('OP que ja passou da meta sugere zero, e zero e valido', () => {
  const c = calcularConclusao(30, 45)
  assert.equal(c.restante, 0)
  assert.equal(erroDeQuantidade(0, 0, c), null)
  assert.equal(erroDeQuantidade(1, 0, c) !== null, true)
})

test('abaixo da meta conclui', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(erroDeQuantidade(27, 0, c), null)
})

test('numero quebrado ou negativo nao passa', () => {
  const c = calcularConclusao(30, 0)
  assert.equal(erroDeQuantidade(-1, 0, c), 'Quantidade inválida')
  assert.equal(erroDeQuantidade(1.5, 0, c), 'Quantidade inválida')
  assert.equal(erroDeQuantidade(1, -2, c), 'Refugo inválido')
})

test('o resumo do historico diz o TOTAL contra a meta', () => {
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0)),
    'Concluída com 30 de 30 peças',
  )
  assert.equal(
    resumoDaConclusao(27, 2, calcularConclusao(30, 0)),
    'Concluída com 27 de 30 peças (3 a menos) · 2 refugo',
  )
  // Com registro anterior o total soma os dois, senao o gerente leria "18 de
  // 30" numa OP que ficou completa.
  assert.equal(
    resumoDaConclusao(18, 0, calcularConclusao(30, 12)),
    'Concluída com 30 de 30 peças',
  )
})

test('a passagem de turno vai NOMEADA no historico', () => {
  // Quem registrou nao e quem produziu: o registro e um so, no fim, no nome
  // de quem concluiu. Ratear seria inventar; nomear a passagem, nao.
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0), 'teste1'),
    'Concluída com 30 de 30 peças · iniciada por teste1',
  )
})

test('mesma pessoa comecando e terminando nao vira ruido', () => {
  assert.equal(
    resumoDaConclusao(30, 0, calcularConclusao(30, 0), null),
    'Concluída com 30 de 30 peças',
  )
})

// -----------------------------------------------------------------
// Como a OP se apresenta na lista
// -----------------------------------------------------------------

test('o modelo some quando ja esta no nome do produto', () => {
  // "Capa de Almofada - ACONCHEGO" + "Caqui · ACONCHEGO · 45x45" dizia
  // ACONCHEGO duas vezes, e a segunda ocupava o lugar de destaque.
  assert.equal(
    destaqueDaVariacao('Capa de Almofada - ACONCHEGO', {
      cor: 'Caqui',
      modelo: 'ACONCHEGO',
      tamanho: '45x45',
    }),
    'Caqui · 45x45',
  )
})

test('mas SOBREVIVE quando o nome nao o contem', () => {
  // Se um produto novo nao seguir o padrao de nomes, o modelo continua
  // aparecendo em vez de sumir em silencio.
  assert.equal(
    destaqueDaVariacao('Capa de Almofada', {
      cor: 'Caqui',
      modelo: 'ACONCHEGO',
      tamanho: '45x45',
    }),
    'Caqui · ACONCHEGO · 45x45',
  )
})

test('acento e caixa nao decidem se uma palavra some', () => {
  assert.equal(
    destaqueDaVariacao('Peseira - Efeito 3D', {
      cor: 'Nude',
      modelo: 'EFEITO 3D',
      tamanho: 'King',
    }),
    'Nude · King',
  )
})

test('campos vazios nao viram separador solto', () => {
  assert.equal(
    destaqueDaVariacao('Manta - ACONCHEGO', {
      cor: 'Areia',
      modelo: null,
      tamanho: null,
    }),
    'Areia',
  )
  assert.equal(
    destaqueDaVariacao('Produto', { cor: null, modelo: null, tamanho: null }),
    '',
  )
})

test('o prazo vira palavra, em dias de CALENDARIO', () => {
  const agora = new Date('2026-09-10T14:00:00')
  assert.equal(prazoEmPalavras(null, agora), null)
  // Venceu as 8h de hoje: continua sendo HOJE as 14h, e nao "atrasada".
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-10T08:00:00'), agora), {
    texto: 'vence HOJE',
    urgente: true,
  })
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-11T23:00:00'), agora), {
    texto: 'vence amanhã',
    urgente: false,
  })
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-18T00:00:00'), agora), {
    texto: '8 dias',
    urgente: false,
  })
})

test('atrasada conta os dias e e urgente', () => {
  const agora = new Date('2026-09-10T14:00:00')
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-09T23:59:00'), agora), {
    texto: 'ATRASADA 1 dia',
    urgente: true,
  })
  assert.deepEqual(prazoEmPalavras(new Date('2026-09-07T00:00:00'), agora), {
    texto: 'ATRASADA 3 dias',
    urgente: true,
  })
})

test('a familia perde o modelo, e so quando ele esta no fim', () => {
  assert.equal(familiaDoProduto('Capa de Almofada - RELEVO', 'RELEVO'), 'Capa de Almofada')
  assert.equal(familiaDoProduto('Peseira - EFEITO 3D', 'EFEITO 3D'), 'Peseira')
  // Nao termina com o modelo: devolve inteiro em vez de cortar errado.
  assert.equal(familiaDoProduto('Capa RELEVO especial', 'RELEVO'), 'Capa RELEVO especial')
  assert.equal(familiaDoProduto('Manta', null), 'Manta')
  // Cortar tudo deixaria a linha vazia — melhor o nome inteiro.
  assert.equal(familiaDoProduto('RELEVO', 'RELEVO'), 'RELEVO')
})

test('agrupa por modelo SEM reordenar', () => {
  // A lista chega ordenada por prioridade/prazo; o grupo entra na posicao da
  // primeira OP dele, entao a urgencia decide a ordem dos grupos tambem.
  const fila = [
    { id: 'a', variacaoModelo: 'ACONCHEGO' },
    { id: 'b', variacaoModelo: 'RELEVO' },
    { id: 'c', variacaoModelo: 'SIENA' },
    { id: 'd', variacaoModelo: 'RELEVO' },
    { id: 'e', variacaoModelo: 'RELEVO' },
  ]
  const g = agruparPorModelo(fila)
  assert.deepEqual(
    g.map((x) => [x.modelo, x.ops.map((o) => o.id)]),
    [
      ['ACONCHEGO', ['a']],
      ['RELEVO', ['b', 'd', 'e']],
      ['SIENA', ['c']],
    ],
  )
})

test('sem modelo vira um grupo proprio, nao some', () => {
  const g = agruparPorModelo([
    { id: 'a', variacaoModelo: null },
    { id: 'b', variacaoModelo: 'RELEVO' },
  ])
  assert.deepEqual(g.map((x) => x.modelo), [SEM_MODELO, 'RELEVO'])
})

test('fila vazia nao vira grupo vazio', () => {
  assert.deepEqual(agruparPorModelo([]), [])
})

test('o titulo sai em PARTES, pras duas telas montarem igual', () => {
  assert.deepEqual(
    tituloDaOp('Peseira - RELEVO', {
      cor: 'Marsala',
      modelo: 'RELEVO',
      tamanho: 'Queen',
    }),
    { familia: 'Peseira', variacao: 'Marsala · Queen', modelo: 'RELEVO' },
  )
})

test('sem modelo, a familia e o nome inteiro', () => {
  assert.deepEqual(
    tituloDaOp('Manta Avulsa', { cor: 'Areia', modelo: null, tamanho: null }),
    { familia: 'Manta Avulsa', variacao: 'Areia', modelo: null },
  )
})

test('o modelo NAO se repete dentro da variacao', () => {
  // Ele ja aparece no cabecalho do grupo (fila) ou na linha de baixo
  // (cartao da maquina). Repetir aqui era a redundancia original.
  const t = tituloDaOp('Capa de Almofada - SIENA', {
    cor: 'Areia e Azul Marinho',
    modelo: 'SIENA',
    tamanho: '45x45',
  })
  assert.equal(t.variacao.includes('SIENA'), false)
  assert.equal(t.variacao, 'Areia e Azul Marinho · 45x45')
})
