import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O pdfjs (importação de envio Full) NÃO pode ser empacotado: ele carrega
  // o próprio worker por import dinâmico em runtime, e dentro do chunk do
  // Turbopack esse caminho não existe — a leitura falha com
  // "Setting up fake worker failed: Cannot find module .../pdf.worker.mjs".
  // Deixando como pacote externo, quem resolve é o Node.
  serverExternalPackages: ['pdfjs-dist'],

  // O Next manda `X-Powered-By: Next.js` por padrão. Não é uma falha por si
  // só, mas entrega de graça qual framework e quais CVEs tentar primeiro.
  poweredByHeader: false,

  // Headers de segurança em TODAS as rotas.
  //
  // O sistema roda na Vercel, que já manda o HSTS
  // (`max-age=63072000; includeSubDomains; preload`) no domínio .vercel.app —
  // por isso ele NÃO está aqui: repetir só criaria duas fontes de verdade
  // pra mesma política.
  async headers() {
    return [
      {
        // Tudo. `/:path*` casa zero ou mais segmentos, então pega a raiz
        // junto com /login, /pedidos/<id>/romaneio e o resto.
        source: '/:path*',
        headers: [
          // --- Clickjacking -------------------------------------------
          // Hoje qualquer site pode embutir o sistema num iframe invisível
          // e colher o clique de quem está logado (mover OP, apagar
          // cadastro). Os dois juntos de propósito: `frame-ancestors` é o
          // mecanismo moderno, `X-Frame-Options` é o que navegador velho
          // entende.
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            // CSP de VERDADE (não Report-Only), mas com UMA diretiva só.
            // Sem `default-src`, tudo que não está escrito aqui segue
            // liberado — então esta linha não tem como quebrar script,
            // estilo ou fetch nenhum. O que fecha de fato é a política
            // completa, que por enquanto vai logo abaixo em Report-Only.
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'",
          },

          // --- Resto ---------------------------------------------------
          // Sem isto o navegador "adivinha" o tipo do arquivo: um upload
          // servido como text/plain pode ser executado como script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Link pra fora leva só a origem, nunca o caminho — o id do
          // pedido não vaza no Referer de um link clicado.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // O sistema não usa nenhuma das três (conferido). Desligar agora
          // é de graça e vira uma trava se um dia entrar código que use.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },

          // --- CSP completa, em modo RELATÓRIO ------------------------
          // Report-Only NÃO bloqueia nada: o navegador só registra a
          // violação no console (DevTools). É de propósito — uma CSP
          // restritiva ligada de uma vez quebra o Next, e não dá pra
          // descobrir isso com a fábrica usando o sistema.
          //
          // Não tem `report-uri`/`report-to`: coletar violação no servidor
          // pediria uma rota nova que aceita POST de qualquer um. Por ora
          // a leitura é pelo console do navegador.
          //
          // Por que `script-src` já vem com 'unsafe-inline': o Next injeta
          // scripts inline (bootstrap, payload do RSC) em toda página, e a
          // saída disso não é "remover o inline", é dar nonce por request
          // no src/proxy.ts. Isso é a fase 2. Deixando liberado agora, o
          // que sobrar no console é sinal de verdade — origem externa
          // inesperada — e não o mesmo erro conhecido mil vezes.
          //
          // 'unsafe-eval' ficou de FORA justamente pra aparecer: React e
          // Next não usam eval em produção, então violação aqui é
          // dependência nova fazendo algo que a gente não sabia.
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              // O kanban e o sino de notificação abrem realtime no
              // navegador (@supabase/ssr) — daí o wss junto do https.
              // viacep e Melhor Envio não entram: são fetch de server
              // action, saem do servidor e o navegador nem vê.
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-src 'none'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },

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
