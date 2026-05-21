import { expect, type Page } from '@playwright/test'

// Credenciais seedadas em scripts/seed.ts (username + senha).
export const TEST_USERS = {
  admin: { username: 'admin', senha: 'Senha123!' },
  gerente: { username: 'gerente', senha: 'Senha123!' },
  operador: { username: 'operador', senha: 'Senha123!' },
  estoquista: { username: 'estoquista', senha: 'Senha123!' },
  vendas: { username: 'vendas', senha: 'Senha123!' },
} as const

// Login pela tela /login. Aguarda o redirect pra /dashboard.
export async function login(
  page: Page,
  user: keyof typeof TEST_USERS = 'admin',
) {
  const cred = TEST_USERS[user]
  await page.goto('/login')
  await page.getByLabel(/usuário/i).fill(cred.username)
  await page.getByLabel(/senha/i).fill(cred.senha)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL('**/dashboard')
  await expect(
    page.getByRole('heading', { name: /dashboard/i }),
  ).toBeVisible()
}

// Devolve um sufixo único pra evitar colisão entre runs do teste.
export function uniqueSuffix(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-6)
  const rnd = Math.random().toString(36).toUpperCase().slice(2, 5)
  return `${ts}${rnd}`
}
