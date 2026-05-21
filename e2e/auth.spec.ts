import { expect, test } from '@playwright/test'

import { login, TEST_USERS } from './helpers'

test.describe('Autenticação', () => {
  test('redireciona usuário não-logado pra /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/login(\?.*)?$/)
    await expect(page.getByRole('heading', { name: /entrar/i })).toBeVisible()
  })

  test('login bem-sucedido leva pra /dashboard', async ({ page }) => {
    await login(page, 'admin')
    await expect(
      page.getByRole('heading', { name: /dashboard/i }),
    ).toBeVisible()
  })

  test('credencial errada mostra erro', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/usuário/i).fill(TEST_USERS.admin.username)
    await page.getByLabel(/senha/i).fill('senhaErradaXX')
    await page.getByRole('button', { name: /entrar/i }).click()

    // Toast / mensagem de erro
    await expect(page.getByText(/usuário ou senha incorretos/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('logout pelo botão da sidebar volta pra /login', async ({ page }) => {
    await login(page, 'admin')
    await page.getByRole('button', { name: /sair/i }).click()
    await page.waitForURL(/\/login(\?.*)?$/)
  })

  test('operador não vê o item Usuários da sidebar', async ({ page }) => {
    await login(page, 'operador')
    // Sidebar links:
    await expect(page.getByRole('link', { name: /produtos/i })).toBeVisible()
    await expect(
      page.getByRole('link', { name: /usuários/i }),
    ).toHaveCount(0)
  })

  test('operador acessando /usuarios é redirecionado pro dashboard', async ({
    page,
  }) => {
    await login(page, 'operador')
    await page.goto('/usuarios')
    await page.waitForURL('**/dashboard')
  })
})
