// As actions, carregadas SÓ DEPOIS dos mocks — o porquê está em mocks.ts.
//
// `require` dentro da função, e não `import` no topo: é o que garante a
// ordem. O tipo vem de `typeof import(...)`, que é só tipo e não carrega nada.
/* eslint-disable @typescript-eslint/no-require-imports */

export function carregarActions() {
  const ordens: typeof import('@/app/(app)/ordens/actions') = require('@/app/(app)/ordens/actions')
  const producao: typeof import('@/app/(app)/producao/actions') = require('@/app/(app)/producao/actions')
  const remessas: typeof import('@/app/(app)/remessas/actions') = require('@/app/(app)/remessas/actions')
  return { ordens, producao, remessas }
}

export type Actions = ReturnType<typeof carregarActions>
