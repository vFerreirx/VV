'use client'

// Estado de recolher/expandir das seções da navegação, persistido em
// localStorage (lembra entre navegações e reloads).

import { useEffect, useState } from 'react'

const KEY = 'vv-nav-collapsed'

export function useNavCollapse() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>
        // Defere pra não dar setState síncrono em effect (lint) nem
        // descompasso de hidratação — server e client começam vazios.
        queueMicrotask(() => setCollapsed(parsed))
      }
    } catch {
      // localStorage indisponível — ignora.
    }
  }, [])

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

  return { collapsed, toggle }
}
