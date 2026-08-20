import { expect, test, type Page } from '@playwright/test'

// ------------------------------------------------------------------
// Credenciais vêm de variáveis de ambiente — NUNCA hardcoded, porque o
// dev server aponta pro Supabase configurado em .env.local (que pode ser
// produção). Sem E2E_USERNAME/E2E_PASSWORD os testes autenticados PULAM.
//
//   E2E_USERNAME=meuusuario E2E_PASSWORD=minhasenha npx playwright test
//
// Use um usuário admin de um ambiente de teste. Os specs são read-only
// (só navegam e conferem a UI), mas rodar contra produção segue por sua
// conta e risco.
// ------------------------------------------------------------------

export const E2E_USERNAME = process.env.E2E_USERNAME ?? ''
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? ''

export const credenciaisDisponiveis = Boolean(E2E_USERNAME && E2E_PASSWORD)

// Pula o teste atual quando não há credenciais configuradas.
export function requerCredenciais() {
  test.skip(
    !credenciaisDisponiveis,
    'Defina E2E_USERNAME e E2E_PASSWORD pra rodar os testes autenticados',
  )
}

// Login pela tela /login. Aguarda o redirect pra /dashboard.
export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel(/usuário/i).fill(E2E_USERNAME)
  await page.getByLabel(/senha/i).fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL('**/dashboard')
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
}
