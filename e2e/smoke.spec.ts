import { expect, test } from '@playwright/test'

import { login, requerCredenciais } from './helpers'

// Smoke tests READ-ONLY: navegam pelas páginas principais e conferem que
// a estrutura renderiza (headings, abas, filtros). Não criam nem alteram
// nenhum dado — seguros pra rodar contra qualquer ambiente.

test.describe('Navegação — páginas principais', () => {
  test.beforeEach(async ({ page }) => {
    requerCredenciais()
    await login(page)
  })

  test('kanban de produção renderiza', async ({ page }) => {
    await page.goto('/producao')
    await expect(page.getByRole('heading', { name: /produção \(kanban\)/i })).toBeVisible()
  })

  test('ordens: lista + filtros', async ({ page }) => {
    await page.goto('/ordens')
    await expect(page.getByRole('heading', { name: /ordens de produção/i })).toBeVisible()
    await expect(page.getByPlaceholder(/buscar por número, sku ou produto/i)).toBeVisible()
  })

  test('variações: abas Cores/Modelos/Tamanhos + redirect das rotas antigas', async ({ page }) => {
    await page.goto('/variacoes')
    await expect(page.getByRole('heading', { name: /variações/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /cores/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /modelos/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /tamanhos/i })).toBeVisible()

    // Rota antiga redireciona pra aba unificada.
    await page.goto('/cores')
    await page.waitForURL(/\/variacoes\?tab=cores/)
  })

  test('fábrica: abas Máquinas/Estações + redirect das rotas antigas', async ({ page }) => {
    await page.goto('/fabrica')
    await expect(page.getByRole('heading', { name: /fábrica/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /máquinas/i })).toBeVisible()

    await page.goto('/maquinas')
    await page.waitForURL(/\/fabrica\?tab=maquinas/)
  })

  test('produtos: lista + form de novo produto renderiza', async ({ page }) => {
    await page.goto('/produtos')
    await expect(page.getByRole('heading', { name: /^produtos$/i })).toBeVisible()

    await page.goto('/produtos/novo')
    await expect(page.getByRole('heading', { name: /novo produto/i })).toBeVisible()
    await expect(page.getByLabel(/sku/i).first()).toBeVisible()
    await expect(page.getByLabel(/^nome\s*\*?$/i).first()).toBeVisible()
  })

  test('kits renderiza', async ({ page }) => {
    await page.goto('/kits')
    await expect(page.getByRole('heading', { name: /^kits$/i })).toBeVisible()
  })

  test('estoque renderiza', async ({ page }) => {
    await page.goto('/estoque')
    await expect(page.getByRole('heading', { name: /estoque/i }).first()).toBeVisible()
  })

  test('vendas: abas Diário/Mensal', async ({ page }) => {
    await page.goto('/vendas')
    await expect(page.getByRole('heading', { name: /^vendas$/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /diário/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /mensal/i })).toBeVisible()

    // Mensal mostra os KPIs (incl. os novos de média/previsão).
    await page.getByRole('tab', { name: /mensal/i }).click()
    await expect(page.getByText(/média por dia/i)).toBeVisible()
  })
})
