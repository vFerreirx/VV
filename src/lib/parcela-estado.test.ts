// Testes da regra de estado da parcela. Runner embutido do Node, sem
// dependência nova (mesmo arranjo de src/lib/producao/regras.test.ts):
//
//     node --test --experimental-strip-types src/lib/parcela-estado.test.ts
//
// O módulo é puro de propósito — sem banco e sem React —, e é isso que
// permite testar aqui a classificação que o painel e o sino compartilham.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { rotuloDaSituacao, situacaoDaParcela } from './parcela-estado.ts'

const HOJE = '2026-09-11'

test('recebida vence tudo, inclusive atraso', () => {
  // Parcela paga com atraso não é "atrasada" — é resolvida. Depois da baixa
  // o que importa é o histórico, não a cobrança.
  const s = situacaoDaParcela('2026-09-01', new Date('2026-09-05'), HOJE)
  assert.equal(s.estado, 'recebida')
  assert.equal(s.cobravel, false)
  assert.equal(s.diasAtraso, 0)
})

test('vence hoje e cobravel, com atraso ZERO', () => {
  const s = situacaoDaParcela(HOJE, null, HOJE)
  assert.deepEqual(s, { estado: 'vence_hoje', diasAtraso: 0, cobravel: true })
})

test('antes do vencimento NAO cobra', () => {
  // O lembrete e "confira se caiu", e essa pergunta nao existe antes da
  // data. Avisar na vespera encheria o sino de coisa sem acao possivel.
  const s = situacaoDaParcela('2026-09-12', null, HOJE)
  assert.deepEqual(s, { estado: 'pendente', diasAtraso: 0, cobravel: false })
  assert.equal(situacaoDaParcela('2026-12-31', null, HOJE).cobravel, false)
})

test('atrasada conta os dias', () => {
  assert.deepEqual(situacaoDaParcela('2026-09-10', null, HOJE), {
    estado: 'atrasada',
    diasAtraso: 1,
    cobravel: true,
  })
  assert.equal(situacaoDaParcela('2026-09-01', null, HOJE).diasAtraso, 10)
})

test('virada de mes e de ano saem certas', () => {
  // `diasEntre` usa Date.UTC, que normaliza dia 0 e dia 32 — entao mes e ano
  // viram de graca. Sem isso, "31/08 visto de 01/09" daria numero errado.
  assert.equal(situacaoDaParcela('2026-08-31', null, '2026-09-01').diasAtraso, 1)
  assert.equal(situacaoDaParcela('2025-12-31', null, '2026-01-01').diasAtraso, 1)
})

test('a data NAO vira Date em lugar nenhum', () => {
  // Se a implementacao construisse `new Date('2026-09-11')` o resultado
  // dependeria do fuso do servidor: na Vercel (UTC) as 21h de Brasilia ja
  // sao o dia seguinte, e a parcela venceria cedo demais. Comparar o mesmo
  // dia consigo mesmo tem que dar "vence hoje" em qualquer maquina.
  for (const dia of ['2026-01-01', '2026-06-15', '2026-12-31']) {
    assert.equal(situacaoDaParcela(dia, null, dia).estado, 'vence_hoje')
  }
})

test('o rotulo curto diz o que a linha precisa', () => {
  assert.equal(rotuloDaSituacao(situacaoDaParcela(HOJE, null, HOJE)), 'vence hoje')
  assert.equal(
    rotuloDaSituacao(situacaoDaParcela('2026-09-10', null, HOJE)),
    'atrasada há 1 dia',
  )
  assert.equal(
    rotuloDaSituacao(situacaoDaParcela('2026-09-08', null, HOJE)),
    'atrasada há 3 dias',
  )
  assert.equal(
    rotuloDaSituacao(situacaoDaParcela('2026-10-01', null, HOJE)),
    'pendente',
  )
})
