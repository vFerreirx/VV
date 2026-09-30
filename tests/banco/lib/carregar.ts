// As actions, carregadas SÓ DEPOIS dos mocks — o porquê está em mocks.ts.
//
// `require` dentro da função, e não `import` no topo: é o que garante a
// ordem. O tipo vem de `typeof import(...)`, que é só tipo e não carrega nada.
/* eslint-disable @typescript-eslint/no-require-imports */

export function carregarActions() {
  const ordens: typeof import('@/app/(app)/ordens/actions') = require('@/app/(app)/ordens/actions')
  const producao: typeof import('@/app/(app)/producao/actions') = require('@/app/(app)/producao/actions')
  const remessas: typeof import('@/app/(app)/remessas/actions') = require('@/app/(app)/remessas/actions')
  const maquinas: typeof import('@/app/(app)/maquinas/actions') = require('@/app/(app)/maquinas/actions')
  const estacoes: typeof import('@/app/(app)/estacoes/actions') = require('@/app/(app)/estacoes/actions')
  const esteAparelho: typeof import('@/app/(app)/este-aparelho/actions') = require('@/app/(app)/este-aparelho/actions')
  const login: typeof import('@/app/(auth)/login/actions') = require('@/app/(auth)/login/actions')
  // Não é action, mas importa `next/headers` e o `@/lib/db`: entra pelo
  // mesmo caminho. É daqui que sai o nome do cookie (`ctx.noAparelho`).
  const aparelho: typeof import('@/lib/auth/estacao-do-aparelho') = require('@/lib/auth/estacao-do-aparelho')
  return { ordens, producao, remessas, maquinas, estacoes, esteAparelho, login, aparelho }
}

export type Actions = ReturnType<typeof carregarActions>
