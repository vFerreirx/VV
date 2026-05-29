'use client'

// Conta de 0 até `value` com easing (easeOutCubic) ao montar.
// Respeita prefers-reduced-motion — nesse caso mostra o valor final direto.

import { useEffect, useState } from 'react'

export function CountUp({
  value,
  duration = 800,
  className,
}: {
  value: number
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || value === 0) {
      setDisplay(value)
      return
    }

    setDisplay(0)
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(value * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <span className={className}>{display.toLocaleString('pt-BR')}</span>
}
