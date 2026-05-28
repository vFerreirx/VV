'use client'

// Registra o service worker /sw.js depois que a página carrega.
// Só roda no client e silencia erros — não queremos quebrar a UI se
// o registro falhar (ex.: localhost sem HTTPS em algum browser).

import { useEffect } from 'react'

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignora — service worker é opcional pro app funcionar.
      })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
  }, [])

  return null
}
