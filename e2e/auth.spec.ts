import { expect, test } from '@playwright/test'

import { E2E_USERNAME, login, requerCredenciais } from './helpers'

test.describe('Autenticação', () => {
  test('redireciona usuário não-logado pra /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL(/\/login(\?.*)?$/)
    await expect(page.getByRole('heading', { name: /entrar/i })).toBeVisible()
  })

  test('login bem-sucedido leva pra /dashboard', async ({ page }) => {
    requerCredenciais()
    await login(page)
  })

  test('credencial errada mostra erro e mantém em /login', async ({ page }) => {
    requerCredenciais()
    await page.goto('/login')
    await page.getByLabel(/usuário/i).fill(E2E_USERNAME)
    await page.getByLabel(/senha/i).fill('senhaErradaXX')
    await page.getByRole('button', { name: /entrar/i }).click()

    await expect(page.getByText(/usuário ou senha incorretos/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('logout volta pra /login', async ({ page }) => {
    requerCredenciais()
    await login(page)
    await page.getByRole('button', { name: /sair/i }).first().click()
    await page.waitForURL(/\/login(\?.*)?$/)
  })
})
