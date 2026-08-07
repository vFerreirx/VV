'use client'

// Estado de recolher/expandir das seções da navegação, persistido em
// localStorage (lembra entre navegações e reloads).

import { useEffect, useState } from 'react'

const KEY = 'vv-nav-collapsed'

export function useNavCollapse() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // O estado persistido já foi aplicado (ou não havia nada salvo).
  const [aplicado, setAplicado] = useState(false)
  // Só depois disso as transições podem rodar. Server e client começam com
  // tudo aberto e o localStorage chega um quadro depois; sem esse gate,
  // TODO grupo fechado apareceria se fechando a cada carregamento.
  const [anima, setAnima] = useState(false)

  useEffect(() => {
    let salvo: Record<string, boolean> | null = null
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) salvo = JSON.parse(raw) as Record<string, boolean>
    } catch {
      // localStorage indisponível — ignora.
    }
    // Defere pra não dar setState síncrono em effect (lint) nem
    // descompasso de hidratação — server e client começam vazios.
    queueMicrotask(() => {
      if (salvo) setCollapsed(salvo)
      setAplicado(true)
    })
  }, [])

  useEffect(() => {
    if (!aplicado) return
    // Dois quadros: o primeiro garante que o estado persistido já pintou,
    // o segundo liga a transição sem que ela pegue essa pintura.
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setAnima(true))
    })
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
    }
  }, [aplicado])

  function toggle(titulo: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [titulo]: !prev[titulo] }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // ignora
      }
      return next
    })
  }

  return { collapsed, toggle, anima }
}
