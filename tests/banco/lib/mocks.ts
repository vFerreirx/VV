// O que só existe dentro do Next, trocado na RESOLUÇÃO de módulo.
//
// ⚠️ instalarMocks() TEM QUE RODAR ANTES DE QUALQUER ACTION CARREGAR. Em CJS
// (o tsx deste projeto, sem "type": "module") a ordem dos requires é a ordem
// do arquivo: um `import` de action no topo de qualquer arquivo daqui
// carregaria a action — e o `@/lib/db` real — antes do mock. Por isso as
// actions entram só por `carregarActions()` (carregar.ts), e o resto de
// tests/banco importa delas SÓ TIPO (`import type`).
//
// ⚠️ SE UMA ACTION NOVA IMPORTAR ALGO QUE SÓ EXISTE NO NEXT (cookies,
// headers, …), o teste quebra no carregamento. O conserto é ACRESCENTAR O
// MOCK aqui, nunca contornar — ver a seção do AGENTS.md.

import Module from 'node:module'

import type { AuthUser } from '@/lib/auth/get-user'
import {
  nivelEfetivo,
  podeEscrever,
  type AreaKey,
  type OverridesAcesso,
} from '@/lib/auth/permissoes'
import type { User } from '@/lib/db/schema'

import type { Tx } from './conexao'

type Resolver = (
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown,
) => string
const Mod = Module as unknown as { _resolveFilename: Resolver }

/**
 * Quem está "logado", qual é a transação e os cookies DO APARELHO — trocados
 * pelo cenário. O pote de cookies é o do tablet: sobrevive à troca de
 * usuário (`ctx.como`), igual ao cookie da estação no aparelho de verdade.
 */
export type Estado = {
  usuario: AuthUser | null
  tx: Tx | null
  cookies: Map<string, string>
}

/** Lançado onde o Next faria `redirect()`: a action não passou da guarda. */
export class Redirecionou extends Error {}

let instalado: Estado | null = null

export function instalarMocks(): Estado {
  if (instalado) return instalado
  const estado: Estado = { usuario: null, tx: null, cookies: new Map() }

  const resolverOriginal = Mod._resolveFilename
  const porPedido: Record<string, string> = {}
  const porCaminho: Record<string, string> = {}

  function mock(spec: string, exports: object) {
    const falso = `\0mock:${spec}`
    let real: string | null = null
    try {
      real = resolverOriginal.call(Module, spec, module, false)
    } catch {
      // 'server-only' não resolve fora do bundler: o mock é pelo nome.
    }
    if (real) porCaminho[real] = falso
    porPedido[spec] = falso
    require.cache[falso] = {
      id: falso,
      filename: falso,
      loaded: true,
      exports,
      children: [],
      paths: [],
    } as unknown as NodeJS.Module
  }

  Mod._resolveFilename = function (request, parent, isMain, options) {
    if (porPedido[request]) return porPedido[request]
    const r = resolverOriginal.call(this, request, parent, isMain, options)
    return porCaminho[r] ?? r
  }

  function usuario(): AuthUser {
    if (!estado.usuario) {
      throw new Error('Action chamada sem usuário: use ctx.como(...) antes')
    }
    return estado.usuario
  }

  // O NÍVEL REAL DE CADA CARGO: as guardas de área usam o `permissoes-db` de
  // verdade (só lê `permissoes_acesso`, dentro da transação) e o
  // `nivelEfetivo` de verdade. O que /permissoes configura vale aqui também.
  async function overrides(): Promise<OverridesAcesso> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const real: typeof import('@/lib/auth/permissoes-db') = require('@/lib/auth/permissoes-db')
    return real.carregarOverrides()
  }

  // O POTE DE COOKIES, em memória. `set` aceita as duas formas do Next:
  // (nome, valor, opções) e ({ name, value, ... }). As opções (prazo,
  // httpOnly) não têm o que fazer aqui.
  const pote = {
    get: (nome: string) => {
      const value = estado.cookies.get(nome)
      return value === undefined ? undefined : { name: nome, value }
    },
    getAll: () =>
      [...estado.cookies].map(([name, value]) => ({ name, value })),
    has: (nome: string) => estado.cookies.has(nome),
    delete: (nome: string | { name: string }) => {
      estado.cookies.delete(typeof nome === 'string' ? nome : nome.name)
      return pote
    },
    set: (
      nomeOuCookie: string | { name: string; value: string },
      valor?: string,
    ) => {
      if (typeof nomeOuCookie === 'string') {
        estado.cookies.set(nomeOuCookie, valor ?? '')
      } else {
        estado.cookies.set(nomeOuCookie.name, nomeOuCookie.value)
      }
      return pote
    },
  }

  /** O que o teste não alcança. Chamou: é dependência nova pra olhar. */
  function proibido(o: string) {
    return () => {
      throw new Error(
        `${o} chamado dentro do test:banco. O teste não troca sessão de ` +
          'verdade: veja qual action passou a depender disso (mocks.ts).',
      )
    }
  }

  mock('server-only', {})
  mock('next/headers', {
    cookies: async () => pote,
    headers: async () => new Headers(),
  })
  mock('next/navigation', {
    redirect: (para: string) => {
      throw new Redirecionou(`redirect(${para})`)
    },
    notFound: () => {
      throw new Error('notFound() chamado')
    },
  })
  // O "Este aparelho" e o login leem o usuário por aqui, e não pelo
  // require-auth. Mesmo usuário da vez; null quando ninguém está "logado".
  mock('@/lib/auth/get-user', {
    getCurrentUser: async () => estado.usuario,
  })
  mock('@/lib/supabase/server', {
    createClient: proibido('createClient (supabase/server)'),
  })
  mock('@/lib/supabase/admin', {
    createAdminClient: proibido('createAdminClient (supabase/admin)'),
  })
  mock('next/cache', {
    revalidatePath: () => {},
    revalidateTag: () => {},
  })
  mock('@/lib/auth/tablet-travado', {
    recusaSeTabletTravado: async () => null,
    sessaoDeOperadorTravada: async () => false,
    horaDoServidorAgora: () => Date.now(),
  })
  mock('@/lib/auth/require-auth', {
    requireAuth: async () => usuario(),
    requireRole: async (roles: User['role'][]) => {
      const u = usuario()
      if (!roles.includes(u.role)) {
        throw new Redirecionou(`${u.role} barrado por requireRole`)
      }
      return u
    },
    requireArea: async (area: AreaKey) => {
      const u = usuario()
      if (nivelEfetivo(u.role, area, await overrides()) === 'nenhum') {
        throw new Redirecionou(`${u.role} sem acesso à área ${area}`)
      }
      return u
    },
    requireAreaEscrita: async (area: AreaKey) => {
      const u = usuario()
      if (!podeEscrever(nivelEfetivo(u.role, area, await overrides()))) {
        throw new Redirecionou(`${u.role} sem escrita na área ${area}`)
      }
      return u
    },
    isManager: (role: User['role']) =>
      role === 'admin' || role === 'gerente_producao',
  })
  mock('@/lib/db', {
    // Fora da transação do teste, qualquer consulta quebra NA HORA, de
    // propósito: nada roda no banco sem passar por `rodarDesfeito`.
    get db() {
      if (!estado.tx) {
        throw new Error('Consulta fora da transação do teste')
      }
      return estado.tx
    },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    schema: require('@/lib/db/schema'),
  })

  instalado = estado
  return estado
}
