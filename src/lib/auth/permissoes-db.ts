import 'server-only'

import { cache } from 'react'

import {
  areasBloqueadasDoRole,
  chaveOverride,
  type AreaKey,
  type OverridesAcesso,
  type Role,
} from './permissoes'
import { db } from '@/lib/db'
import { permissoesAcesso } from '@/lib/db/schema'

// Carrega as overrides de acesso (liga/desliga) do banco. Cacheado por
// request — várias guardas na mesma navegação batem no banco uma vez só.
export const carregarOverrides = cache(async (): Promise<OverridesAcesso> => {
  const linhas = await db
    .select({
      role: permissoesAcesso.role,
      area: permissoesAcesso.area,
      liberado: permissoesAcesso.liberado,
    })
    .from(permissoesAcesso)

  const overrides: OverridesAcesso = {}
  for (const l of linhas) {
    overrides[chaveOverride(l.role as Role, l.area as AreaKey)] = l.liberado
  }
  return overrides
})

// Áreas que o cargo não acessa (pra esconder do menu).
export async function areasBloqueadas(role: Role): Promise<AreaKey[]> {
  const overrides = await carregarOverrides()
  return areasBloqueadasDoRole(role, overrides)
}
