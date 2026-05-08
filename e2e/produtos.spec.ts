import { expect, test } from '@playwright/test'

import { login } from './helpers'

test.describe('Produtos — leitura e navegação', () => {
  test('lista mostra produtos seedados e permite buscar', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/produtos')

    await expect(
      page.getByRole('heading', { name: /^produtos$/i }),
    ).toBeVisible()

    // Pelo menos um produto seedado (MAL-001) aparece.
    await expect(page.getByText('MAL-001').first()).toBeVisible()

    // Busca por SKU específico filtra a lista.
    await page
      .getByPlaceholder(/buscar por sku ou nome/i)
      .fill('MAL-005')
    await page.getByRole('button', { name: /buscar/i }).click()
    await expect(page).toHaveURL(/\/produtos\?.*q=MAL-005/, { timeout: 10_000 })
    await expect(page.getByText('MAL-005').first()).toBeVisible()
  })

  test('formulário de novo produto abre e renderiza campos esperados', async ({
    page,
  }) => {
    await login(page, 'admin')
    await page.goto('/produtos/novo')

    await expect(
      page.getByRole('heading', { name: /novo produto/i }),
    ).toBeVisible()

    // Campos principais visíveis
    await expect(page.getByLabel(/sku/i).first()).toBeVisible()
    await expect(page.getByLabel(/^nome\s*\*?$/i).first()).toBeVisible()
    await expect(page.getByLabel(/gramatura/i)).toBeVisible()
    await expect(
      page.getByRole('button', { name: /criar produto/i }),
    ).toBeVisible()
  })

  test('vendas não vê botão Novo produto', async ({ page }) => {
    await login(page, 'vendas')
    await page.goto('/produtos')
    await expect(page.getByText('MAL-001').first()).toBeVisible()
    // Manager-only buttons não aparecem
    await expect(
      page.getByRole('button', { name: /novo produto/i }),
    ).toHaveCount(0)
  })
})
