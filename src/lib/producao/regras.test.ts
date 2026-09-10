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
