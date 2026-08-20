'use server'

import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import {
  AREA_MAP,
  NIVEL_OPCOES,
  ROLES_EDITAVEIS,
  type AreaKey,
  type OpcaoNivel,
  type Role,
} from '@/lib/auth/permissoes'
import { db } from '@/lib/db'
import { permissoesAcesso } from '@/lib/db/schema'

export type ActionResult =
  | { success: true; message?: string }
  | { success: false; error: string }

export type ItemPermissao = { role: Role; area: AreaKey; nivel: OpcaoNivel }

const OPCOES_VALIDAS = new Set<OpcaoNivel>(NIVEL_OPCOES.map((o) => o.value))

export async function salvarPermissoesAction(
  itens: ItemPermissao[],
): Promise<ActionResult> {
  const admin = await requireRole(['admin'])

  // Só aceita combinações válidas (cargo editável + área editável + nível ok).
  const validos = itens.filter(
    (i) =>
      ROLES_EDITAVEIS.includes(i.role) &&
      AREA_MAP[i.area]?.editavel === true &&
      OPCOES_VALIDAS.has(i.nivel),
  )

  if (validos.length === 0) {
    return { success: false, error: 'Nada pra salvar' }
  }

  for (const i of validos) {
    await db
      .insert(permissoesAcesso)
      .values({
        role: i.role,
        area: i.area,
        nivel: i.nivel,
        atualizadoPor: admin.id,
      })
      .onConflictDoUpdate({
        target: [permissoesAcesso.role, permissoesAcesso.area],
        set: { nivel: i.nivel, atualizadoPor: admin.id },
      })
  }

  // Revalida o layout pra o menu refletir o novo acesso na hora.
  revalidatePath('/', 'layout')
  return { success: true, message: 'Permissões atualizadas' }
}
