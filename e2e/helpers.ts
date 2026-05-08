import { expect, type Page } from '@playwright/test'

// Credenciais seedadas em scripts/seed.ts
export const TEST_USERS = {
  admin: { email: 'admin@malharia.dev', senha: 'Senha123!' },
  gerente: { email: 'gerente@malharia.dev', senha: 'Senha123!' },
  operador: { email: 'operador@malharia.dev', senha: 'Senha123!' },
  estoquista: { email: 'estoquista@malharia.dev', senha: 'Senha123!' },
  vendas: { email: 'vendas@malharia.dev', senha: 'Senha123!' },
} as const

// Login pela tela /login. Aguarda o redirect pra /dashboard.
export async function login(
  page: Page,
  user: keyof typeof TEST_USERS = 'admin',
) {
  const cred = TEST_USERS[user]
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(cred.email)
  await page.getByLabel(/senha/i).fill(cred.senha)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL('**/dashboard')
  await expect(
    page.getByRole('heading', { name: /dashboard/i }),
  ).toBeVisible()
}

// Devolve um sufixo único pra evitar colisão entre runs do teste.
// Usa timestamp + random pra rodar em paralelo no futuro.
export function uniqueSuffix(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-6)
  const rnd = Math.random().toString(36).toUpperCase().slice(2, 5)
  return `${ts}${rnd}`
}
