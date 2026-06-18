import 'server-only'

import { cache } from 'react'

import {
  areasBloqueadasDoRole,
  chaveOverride,
  nivelEfetivo,
  type AreaKey,
  type Nivel,
  type OverridesAcesso,
  type Role,
} from './permissoes'
import { db } from '@/lib/db'
import { permissoesAcesso } from '@/lib/db/schema'

// Carrega as overrides de acesso (nível por cargo/área) do banco. Cacheado
// por request — várias guardas na mesma navegação batem no banco uma vez só.
export const carregarOverrides = cache(async (): Promise<OverridesAcesso> => {
  const linhas = await db
    .select({
      role: permissoesAcesso.role,
      area: permissoesAcesso.area,
      nivel: permissoesAcesso.nivel,
    })
    .from(permissoesAcesso)

  const overrides: OverridesAcesso = {}
  for (const l of linhas) {
    overrides[chaveOverride(l.role as Role, l.area as AreaKey)] =
      l.nivel as Nivel
  }
  return overrides
})

// Nível efetivo de um cargo numa área (já considerando as overrides).
export async function nivelDaAreaPara(
  role: Role,
  area: AreaKey,
): Promise<Nivel> {
  const overrides = await carregarOverrides()
  return nivelEfetivo(role, area, overrides)
}

// Áreas que o cargo não acessa (pra esconder do menu).
export async function areasBloqueadas(role: Role): Promise<AreaKey[]> {
  const overrides = await carregarOverrides()
  return areasBloqueadasDoRole(role, overrides)
}
