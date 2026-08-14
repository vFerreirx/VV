import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O pdfjs (importação de envio Full) NÃO pode ser empacotado: ele carrega
  // o próprio worker por import dinâmico em runtime, e dentro do chunk do
  // Turbopack esse caminho não existe — a leitura falha com
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
  // Deixando como pacote externo, quem resolve é o Node.
  serverExternalPackages: ['pdfjs-dist'],

  // A tela de "orçamento" virou "pedido" e a rota foi junto. O redirect
  // segura os links antigos: favorito do navegador, link mandado no
  // WhatsApp, aba aberta há dias. `:path*` casa zero ou mais segmentos,
  // então cobre /orcamentos e /orcamentos/<id>/romaneio no mesmo par.
  //
  // Temporário (307) de propósito: o 308 fica gravado no navegador pra
  // sempre e, se um dia o nome voltar atrás, não tem como desfazer na
  // máquina de quem já acessou.
  async redirects() {
    return [
      {
        source: '/orcamentos/:path*',
        destination: '/pedidos/:path*',
        permanent: false,
      },
      // Mesma história com "comprador" → "cliente": só a tela e a rota
      // mudaram, o banco continua `compradores`.
      {
        source: '/compradores/:path*',
        destination: '/clientes/:path*',
        permanent: false,
      },
    ]
  },

  experimental: {
    // Liga o <ViewTransition> do React (morph, slide direcional, crossfade e
    // reveal de Suspense). Ligar isso troca o React do bundle pelo canal
    // experimental que o Next empacota — é o que dá acesso ao componente.
    viewTransition: true,

    serverActions: {
      // O PDF do envio sobe por server action. Os arquivos reais têm ~30-45KB,
      // mas o padrão do Next é 1MB e um envio grande passaria disso.
      bodySizeLimit: '8mb',
    },
  },
}

export default nextConfig
