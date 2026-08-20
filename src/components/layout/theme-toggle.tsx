'use client'

import { Moon, Sun } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

// SSR não conhece o tema do client; renderizamos só no client pra evitar
// mismatch sem precisar de useEffect+setState.
function ThemeToggleInner() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? 'Tema claro' : 'Tema escuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  )
}

export const ThemeToggle = dynamic(() => Promise.resolve(ThemeToggleInner), {
  ssr: false,
  loading: () => (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Tema"
      className="opacity-0"
      disabled
    >
      <Moon />
    </Button>
  ),
})
