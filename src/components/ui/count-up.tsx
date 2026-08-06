'use client'

// Conta até `value` com easing (easeOutCubic).
//
// Ao montar sai de 0. Quando o valor MUDA depois disso, sai do valor
// anterior — não volta pra zero. O kanban assina realtime e os KPIs mudam
// sozinhos na tela: um "12" que cai pra 0 e sobe até 13 lê como se o número
// tivesse zerado, que é justamente o susto que ninguém quer no painel.
//
// Respeita prefers-reduced-motion — nesse caso mostra o valor final direto.

import { useEffect, useRef, useState } from 'react'

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
  // De onde a próxima animação parte. Guardado em ref (e não em estado) de
  // propósito: é atualizado a cada quadro e não deve provocar re-render.
  const deOnde = useRef(0)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const inicio = deOnde.current
    if (reduce || inicio === value) {
      deOnde.current = value
      setDisplay(value)
      return
    }

    const distancia = value - inicio
    setDisplay(inicio)
    const comecou = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - comecou) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const atual = Math.round(inicio + distancia * eased)
      deOnde.current = atual
      setDisplay(atual)
      if (t < 1) raf = requestAnimationFrame(tick)
      else deOnde.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      // Interrompido no meio (valor mudou de novo, ou desmontou): a próxima
      // animação parte de onde esta parou, não de um valor que já ficou
      // para trás.
    }
  }, [value, duration])

  return <span className={className}>{display.toLocaleString('pt-BR')}</span>
}
