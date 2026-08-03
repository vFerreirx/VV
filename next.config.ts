import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O pdfjs (importação de envio Full) NÃO pode ser empacotado: ele carrega
  // o próprio worker por import dinâmico em runtime, e dentro do chunk do
  // Turbopack esse caminho não existe — a leitura falha com
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
  // Deixando como pacote externo, quem resolve é o Node.
  serverExternalPackages: ['pdfjs-dist'],

  experimental: {
    serverActions: {
      // O PDF do envio sobe por server action. Os arquivos reais têm ~30-45KB,
      // mas o padrão do Next é 1MB e um envio grande passaria disso.
      bodySizeLimit: '8mb',
    },
  },
}

export default nextConfig
