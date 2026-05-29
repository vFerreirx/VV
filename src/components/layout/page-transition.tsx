'use client'

// Fade-in leve a cada troca de rota. A key por pathname remonta o
// conteúdo, disparando a animação de entrada. motion-reduce desliga.

import { usePathname } from 'next/navigation'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div
      key={pathname}
      className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
    >
      {children}
    </div>
  )
}
