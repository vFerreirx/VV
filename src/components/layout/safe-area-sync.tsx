'use client'

// Contorna um bug do iOS (Safari/PWA standalone): o valor de
// env(safe-area-inset-*) é calculado corretamente num reflow (ex.: girar a
// tela), mas o iOS "esquece" de reaplicá-lo em navegações SPA (troca de
// rota sem reload) — aí o conteúdo volta a invadir o notch/Dynamic Island.
//
// Solução: medimos os insets via getComputedStyle (sempre fresco/correto)
// e os gravamos como variáveis CSS no <html>. Variáveis no :root não se
// perdem na navegação, então o layout fica estável. O CSS usa
// var(--sa-*, env(...)) — cai no env() nativo enquanto o JS não roda.

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function SafeAreaSync() {
  const pathname = usePathname()

  useEffect(() => {
    const root = document.documentElement

    const probe = document.createElement('div')
    probe.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top)',
      'padding-right:env(safe-area-inset-right)',
      'padding-bottom:env(safe-area-inset-bottom)',
      'padding-left:env(safe-area-inset-left)',
    ].join(';')
    document.body.appendChild(probe)

    const apply = () => {
      const cs = getComputedStyle(probe)
      root.style.setProperty('--sa-top', cs.paddingTop || '0px')
      root.style.setProperty('--sa-right', cs.paddingRight || '0px')
      root.style.setProperty('--sa-bottom', cs.paddingBottom || '0px')
      root.style.setProperty('--sa-left', cs.paddingLeft || '0px')
    }

    // Mede agora e de novo no próximo frame (deixa o layout assentar
    // após a troca de rota antes de ler os valores).
    apply()
    const raf = requestAnimationFrame(() => requestAnimationFrame(apply))

    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      probe.remove()
    }
  }, [pathname])

  return null
}
