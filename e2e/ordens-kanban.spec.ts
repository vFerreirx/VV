import { expect, test } from '@playwright/test'

import { login } from './helpers'

test.describe('Ordens — leitura', () => {
  test('lista de OPs mostra OPs seedadas com filtros', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/ordens')

    await expect(
      page.getByRole('heading', { name: /ordens de produção/i }),
    ).toBeVisible()

    // Pelo menos uma OP seedada deve aparecer (formato OP-AAAA-NNNN)
    await expect(
      page.getByText(/OP-\d{4}-\d{4}/).first(),
    ).toBeVisible()

    // Filtros visíveis (busca + 3 selects)
    await expect(
      page.getByPlaceholder(/buscar por número, sku ou produto/i),
    ).toBeVisible()
  })

  test('formulário de nova OP carrega produtos e máquinas seedados', async ({
    page,
  }) => {
    await login(page, 'admin')
    await page.goto('/ordens/novo')

    await expect(
      page.getByRole('heading', { name: /nova ordem de produção/i }),
    ).toBeVisible()

    // Os selects principais aparecem
    await expect(page.getByLabel(/^produto\s*\*?$/i)).toBeVisible()
    await expect(page.getByLabel(/quantidade \(peças\)/i)).toBeVisible()
    await expect(page.getByLabel(/canal de destino/i)).toBeVisible()
  })
})

test.describe('Kanban', () => {
  test('renderiza 7 colunas do fluxo do kanban', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/producao')

    await expect(
      page.getByRole('heading', { name: /produção \(kanban\)/i }),
    ).toBeVisible()

    // Cada coluna tem um header com o label do status.
    // Status devem estar todos representados (com OPs seedadas em cada um).
    const statusLabels = [
      /aguardando mp/i,
      /programado/i,
      /em produção/i,
      /acabamento/i,
      /embalagem/i,
      /pronto envio/i,
      /enviado/i,
    ]
    for (const label of statusLabels) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
  })

  test('clicar em um card abre o side sheet com detalhes', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/producao')

    // Pega o primeiro card visível pelo padrão de número
    const primeiroCard = page.getByText(/OP-\d{4}-\d{4}/).first()
    await expect(primeiroCard).toBeVisible()
    const numero = (await primeiroCard.textContent())?.trim() ?? ''

    await primeiroCard.click()

    // Side sheet aparece com SheetTitle = número
    const sheetTitle = page.locator('[data-slot="sheet-title"]')
    await expect(sheetTitle).toContainText(numero, { timeout: 10_000 })

    // Histórico aparece (eventos seedados ou criados nas migrations)
    await expect(page.getByText(/histórico/i)).toBeVisible()
  })

  test('busca no kanban filtra cards', async ({ page }) => {
    await login(page, 'admin')
    await page.goto('/producao')

    // Pega o número da primeira OP visível
    const primeiroCard = page.getByText(/OP-\d{4}-\d{4}/).first()
    const numero = (await primeiroCard.textContent())?.trim() ?? ''

    await page.getByPlaceholder(/buscar op, sku ou produto/i).fill(numero)
    await page.getByRole('button', { name: /^buscar$/i }).click()

    await expect(page).toHaveURL(/\?.*q=OP-/, { timeout: 10_000 })
    // Apenas o card filtrado aparece
    await expect(page.getByText(numero, { exact: true })).toHaveCount(1)
  })
})
