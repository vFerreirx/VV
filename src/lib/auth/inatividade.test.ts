// Testes da regra de inatividade do tablet. Mesmo runner das regras de
// produção, sem dependência nova:
//
//     node --test --experimental-strip-types src/lib/auth/inatividade.test.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  expirouPorInatividade,
  horaNoServidor,
  LIMITE_MS,
  offsetDoRelogio,
} from './inatividade.ts'

const MIN = 60_000
// Um instante qualquer do servidor.
const T = Date.UTC(2026, 8, 15, 14, 0, 0)

// O que o cliente grava no cookie ao tocar, e o que o servidor decide depois.
function tocarEConferir(opts: {
  desvioDoTablet: number
  usarOffset: boolean
  paradoPor: number
}): boolean {
  // O tablet recebe a página no instante T do servidor, com o relógio dele
  // deslocado de `desvioDoTablet`.
  const tabletAoReceber = T + opts.desvioDoTablet
  const offset = offsetDoRelogio(T, tabletAoReceber)

  // Toca um segundo depois.
  const tabletNoToque = tabletAoReceber + 1000
  const gravado = opts.usarOffset
    ? horaNoServidor(tabletNoToque, offset)
    : tabletNoToque

  // O servidor confere `paradoPor` depois do toque, no relógio DELE.
  const servidorNaConferencia = T + 1000 + opts.paradoPor
  return expirouPorInatividade(String(gravado), servidorNaConferencia)
}

test('tablet ATRASADO 40 min: sem offset trava logo depois do toque', () => {
  // O bug que o offset corrige: o cookie nasce 40 min no passado e o
  // servidor acha que ninguém toca há 40 min — travaria inclusive logo
  // depois do PIN.
  assert.equal(
    tocarEConferir({ desvioDoTablet: -40 * MIN, usarOffset: false, paradoPor: 1000 }),
    true,
  )
})

test('tablet ATRASADO 40 min: com offset, recém-tocado nao trava', () => {
  assert.equal(
    tocarEConferir({ desvioDoTablet: -40 * MIN, usarOffset: true, paradoPor: 1000 }),
    false,
  )
})

test('tablet ADIANTADO 40 min: sem offset nunca trava', () => {
  // O outro sentido: o cookie nasce 40 min no futuro, e 31 min parado ainda
  // parecem 9 min negativos.
  assert.equal(
    tocarEConferir({ desvioDoTablet: 40 * MIN, usarOffset: false, paradoPor: 31 * MIN }),
    false,
  )
})

test('tablet ADIANTADO 40 min: com offset, 31 min parado trava', () => {
  assert.equal(
    tocarEConferir({ desvioDoTablet: 40 * MIN, usarOffset: true, paradoPor: 31 * MIN }),
    true,
  )
})

test('relogio certo: trava depois do limite, nao antes', () => {
  assert.equal(
    tocarEConferir({ desvioDoTablet: 0, usarOffset: true, paradoPor: 29 * MIN }),
    false,
  )
  assert.equal(
    tocarEConferir({ desvioDoTablet: 0, usarOffset: true, paradoPor: 31 * MIN }),
    true,
  )
})

test('a decisao do cliente, em horario de servidor, bate com a do servidor', () => {
  // O cliente decide parar de gravar com a MESMA conta: se as duas usassem
  // relogios diferentes, a tela acharia que esta destravada enquanto o
  // servidor recusa.
  for (const desvio of [-90 * MIN, -40 * MIN, 0, 40 * MIN, 90 * MIN]) {
    const offset = offsetDoRelogio(T, T + desvio)
    const toqueServidor = horaNoServidor(T + desvio, offset)
    const depois = 31 * MIN
    const clienteAcha =
      horaNoServidor(T + desvio + depois, offset) - toqueServidor > LIMITE_MS
    const servidorAcha = expirouPorInatividade(String(toqueServidor), T + depois)
    assert.equal(clienteAcha, servidorAcha, `desvio ${desvio / MIN} min`)
  }
})

test('cookie ilegivel ou ausente nao trava', () => {
  assert.equal(expirouPorInatividade(undefined, T), false)
  assert.equal(expirouPorInatividade('abc', T), false)
  assert.equal(expirouPorInatividade('0', T), false)
})
