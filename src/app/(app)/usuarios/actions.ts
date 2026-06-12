'use server'

import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { users, type User } from '@/lib/db/schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { usernameToInternalEmail } from '@/lib/validators/auth'
import {
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  resetSenhaSchema,
  type AtualizarUsuarioInput,
  type CriarUsuarioInput,
  type ResetSenhaInput,
} from '@/lib/validators/usuarios'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

// -----------------------------------------------------------------
// Listagem (admin)
// -----------------------------------------------------------------

export async function listarUsuarios(): Promise<User[]> {
  await requireRole(['admin'])
  return db
    .select()
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(asc(users.nome))
}

// -----------------------------------------------------------------
// Criar (admin) — usa Admin API + trigger handle_new_user
// -----------------------------------------------------------------

export async function criarUsuarioAction(
  input: CriarUsuarioInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole(['admin'])

  const parsed = criarUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  // Username único entre os ativos.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, data.username), isNull(users.deletedAt)))
    .limit(1)
  if (existing.length > 0) {
    return {
      success: false,
      error: `Já existe um usuário com o nome "${data.username}"`,
    }
  }

  // O Supabase Auth precisa de um email — montamos a partir do username.
  // O usuário só conhece o username pra logar.
  const internalEmail = usernameToInternalEmail(data.username)

  const supaAdmin = createAdminClient()
  const { data: created, error } = await supaAdmin.auth.admin.createUser({
    email: internalEmail,
    password: data.senha,
    email_confirm: true,
    user_metadata: {
      username: data.username,
      nome: data.nome,
      telefone: data.telefone ?? null,
      role: data.role,
    },
  })

  if (error || !created.user) {
    return {
      success: false,
      error: error?.message ?? 'Não foi possível criar o usuário',
    }
  }

  // O trigger handle_new_user já populou public.users. Apenas garante
  // que telefone foi setado (o trigger faz COALESCE conservador).
  if (data.telefone) {
    await db
      .update(users)
      .set({ telefone: data.telefone })
      .where(eq(users.id, created.user.id))
  }

  revalidatePath('/usuarios')
  return {
    success: true,
    data: { id: created.user.id },
    message: 'Usuário criado',
  }
}

// -----------------------------------------------------------------
// Atualizar dados (admin) — nome, telefone, role, ativo
// -----------------------------------------------------------------

export async function atualizarUsuarioAction(
  id: string,
  input: AtualizarUsuarioInput,
): Promise<ActionResult> {
  const adminUser = await requireRole(['admin'])

  const parsed = atualizarUsuarioSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }
  const data = parsed.data

  const [atual] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Usuário não encontrado' }
  }

  // Admin não pode tirar a própria role admin nem se desativar — evita
  // ficar sem ninguém com acesso.
  if (id === adminUser.id) {
    if (data.role !== 'admin') {
      return {
        success: false,
        error: 'Você não pode alterar a própria role',
      }
    }
    if (!data.ativo) {
      return {
        success: false,
        error: 'Você não pode se desativar',
      }
    }
  }

  // Se for outro admin sendo desativado, garante que sobrou ao menos um
  // admin ativo.
  if (atual.role === 'admin' && (!data.ativo || data.role !== 'admin')) {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          eq(users.role, 'admin'),
          eq(users.ativo, true),
        ),
      )
    if ((total ?? 0) <= 1) {
      return {
        success: false,
        error: 'Precisa restar ao menos um administrador ativo',
      }
    }
  }

  await db
    .update(users)
    .set({
      nome: data.nome,
      telefone: data.telefone ?? null,
      role: data.role,
      ativo: data.ativo,
    })
    .where(eq(users.id, id))

  revalidatePath('/usuarios')
  return { success: true, message: 'Usuário atualizado' }
}

// -----------------------------------------------------------------
// Reset de senha (admin)
// -----------------------------------------------------------------

export async function resetSenhaAction(
  id: string,
  input: ResetSenhaInput,
): Promise<ActionResult> {
  await requireRole(['admin'])

  const parsed = resetSenhaSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    }
  }

  const supaAdmin = createAdminClient()
  const { error } = await supaAdmin.auth.admin.updateUserById(id, {
    password: parsed.data.novaSenha,
  })
  if (error) {
    return { success: false, error: error.message ?? 'Falha ao resetar senha' }
  }

  return { success: true, message: 'Senha redefinida' }
}

// -----------------------------------------------------------------
// Excluir (soft delete + bloqueio no auth)
// -----------------------------------------------------------------

export async function excluirUsuarioAction(
  id: string,
): Promise<ActionResult> {
  const adminUser = await requireRole(['admin'])

  if (id === adminUser.id) {
    return { success: false, error: 'Você não pode excluir a si mesmo' }
  }

  const [atual] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1)
  if (!atual) {
    return { success: false, error: 'Usuário não encontrado' }
  }

  // Garante que sobre ao menos um admin ativo se este era admin.
  if (atual.role === 'admin') {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          eq(users.role, 'admin'),
          eq(users.ativo, true),
        ),
      )
    if ((total ?? 0) <= 1) {
      return {
        success: false,
        error: 'Precisa restar ao menos um administrador ativo',
      }
    }
  }

  // Soft delete em public.users + bloqueia no auth (banido).
  await db
    .update(users)
    .set({ deletedAt: new Date(), ativo: false })
    .where(eq(users.id, id))

  // Bloqueia login por 100 anos (efetivamente permanente).
  const supaAdmin = createAdminClient()
  await supaAdmin.auth.admin.updateUserById(id, {
    ban_duration: '876000h', // 100 anos
  })

  revalidatePath('/usuarios')
  return { success: true, message: 'Usuário excluído' }
}
