'use client'

// Pista de navegação pendente. Precisa ser um componente separado porque
// `useLinkStatus` só funciona DENTRO de um <Link> — é ele que fornece o
// contexto.
//
// Em produção os links do menu já vêm prefetchados, então na maioria das
// vezes `pending` nem chega a ficar true e a pista não aparece. Ela é pro
// caso lento: rota dinâmica ainda em voo, rede ruim no galpão.

import { useLinkStatus } from 'next/link'

export function NavLinkHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden
      data-pending={pending}
      className={className ? `link-hint ${className}` : 'link-hint'}
    />
  )
}
