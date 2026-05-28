// Service worker mínimo — existe só pra Chrome considerar o app instalável (PWA).
// Não faz cache offline por enquanto (todos os dados são server-rendered e
// dependem do Supabase). Se um dia quisermos modo offline, expandir aqui.

const CACHE_NAME = 'vanvest-v1'

self.addEventListener('install', () => {
  // Ativa imediatamente sem esperar abas antigas fecharem.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Limpa caches antigos de versões anteriores.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

// Passa todas as requests direto pra rede — sem cache.
// (Necessário ter um handler de fetch pro Chrome aceitar como instalável.)
self.addEventListener('fetch', () => {
  // No-op: deixa o browser tratar normalmente.
})
