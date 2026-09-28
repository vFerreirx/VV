// Os fragmentos de SQL da conclusão, compilados SEM BANCO. Roda com o tsx
// (resolve o `@/` e os imports sem extensão do schema):
//
//     npx tsx --test src/lib/db/conclusao-da-op-sql.test.ts
//
// ⚠️ POR QUE ESTE TESTE EXISTE: um Date cru dentro de sql`` passa no
// type-check, no lint e nos testes puros, e só quebra EM RUNTIME — o driver
// do Drizzle pro postgres-js troca o serializer dos timestamps pela
// identidade, e o postgres.js recusa o Date. Foi o que derrubou a aba
// Produção depois do PR #14. Compilar o fragmento com o PgDialect mostra o
// parâmetro como ele sai pro driver: Date aqui é a página caindo lá.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PgDialect } from 'drizzle-orm/pg-core'

import { concluidaDesdeSql, concluidaEmSql } from './conclusao-da-op-sql'

const dialect = new PgDialect()

test('concluidaDesdeSql não manda Date cru pro driver', () => {
  const desde = new Date('2026-09-27T12:00:00.000Z')
  const { params } = dialect.sqlToQuery(concluidaDesdeSql(desde))

  assert.ok(params.length > 0, 'o instante de corte tem que ir como parâmetro')
  for (const p of params) {
    assert.ok(!(p instanceof Date), `parâmetro Date cru: ${String(p)}`)
  }
  assert.ok(
    params.includes(desde.toISOString()),
    `o corte devia sair em ISO; saiu ${JSON.stringify(params)}`,
  )
})

test('concluidaEmSql não tem parâmetro', () => {
  assert.deepEqual(dialect.sqlToQuery(concluidaEmSql).params, [])
})
