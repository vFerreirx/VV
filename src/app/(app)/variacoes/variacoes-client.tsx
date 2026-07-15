'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

import type { VariacoesTabs as VariacoesTabsType } from './variacoes-tabs'

// DEBUG TEMPORÁRIO: renderiza o VariacoesTabs SÓ no cliente (ssr: false).
// Assim, se algo quebra na renderização, o erro estoura no cliente com a
// mensagem REAL (produção só redige erros server-side) e o error.tsx pega.
const VariacoesTabs = dynamic(
  () => import('./variacoes-tabs').then((m) => m.VariacoesTabs),
  { ssr: false },
)

export function VariacoesClient(
  props: ComponentProps<typeof VariacoesTabsType>,
) {
  return <VariacoesTabs {...props} />
}
