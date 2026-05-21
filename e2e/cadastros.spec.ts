import { expect, test } from '@playwright/test'

import { login } from './helpers'

test.describe('Catálogos auxiliares (cores, modelos, tamanhos)', () => {
  test('/cores lista as cores seedadas', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/cores')

    await expect(
      page.getByRole('heading', { name: /^cores$/i }),
    ).toBeVisible()
    await expect(page.getByText('Branco').first()).toBeVisible()
    await expect(page.getByText('Preto').first()).toBeVisible()
  })

  test('/modelos lista os modelos seedados', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/modelos')

    await expect(
      page.getByRole('heading', { name: /^modelos$/i }),
    ).toBeVisible()
    await expect(page.getByText('Liso').first()).toBeVisible()
    await expect(
      page.getByRole('button', { name: /novo modelo/i }),
    ).toBeVisible()
  })

  test('/tamanhos lista os tamanhos seedados', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/tamanhos')

    await expect(
      page.getByRole('heading', { name: /^tamanhos$/i }),
    ).toBeVisible()
    // P, M, G, GG + Solteiro, Casal, Queen, King
    await expect(page.getByText('Queen').first()).toBeVisible()
    await expect(page.getByText('King').first()).toBeVisible()
  })

  test('vendas não vê botão de novo cadastro nas listas', async ({ page }) => {
    await login(page, 'vendas')
    await page.goto('/modelos')
    await expect(
      page.getByRole('button', { name: /novo modelo/i }),
    ).toHaveCount(0)

    await page.goto('/tamanhos')
    await expect(
      page.getByRole('button', { name: /novo tamanho/i }),
    ).toHaveCount(0)
  })
})
