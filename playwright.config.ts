import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.PLAYWRIGHT_PORT ?? '3000'
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // Limita o paralelismo pra não brigar com o estado compartilhado do banco.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Opcional: rodar também em viewport tablet pra cobrir o caso de uso real.
    // Descomente quando os testes-base estiverem estáveis.
    // {
    //   name: 'tablet',
    //   use: { ...devices['iPad Pro 11'] },
    // },
  ],

  webServer: {
    // Sobe o dev server caso ainda não esteja rodando. Em CI, melhor usar
    // `npm run build && npm run start` pra performance.
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
