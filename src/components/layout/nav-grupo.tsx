'use client'

// Grupo (seção) da navegação, compartilhado por Sidebar e MobileNav.
//
// Usa o Collapsible do Base UI: o painel publica `--collapsible-panel-height`
// e os data attributes de entrada/saída, então a altura anima nas DUAS
// direções sem medir nada na mão — o React só desmonta o conteúdo depois
// que a animação de saída termina. Com `{!fechado && ...}` fechar nunca
// animaria, porque o DOM some antes da transição rodar.
//
// Controlado (`open` + `onOpenChange`): o estado é do useNavCollapse, que
// persiste em localStorage. Com o estado interno do Collapsible a
// persistência se perderia.
//
// `anima=false` (primeira aplicação do estado persistido) tira só o
// `transition-property`, NUNCA a `transition-duration`: o Collapsible
// detecta o tipo de animação UMA vez, lendo `transitionDuration` do
// computed style do painel no primeiro mount, e guarda num ref pro resto
// da sessão. Se lesse `0s` ali, gravaria "sem animação" e nada mais
// animaria depois.

import { Collapsible } from '@base-ui/react/collapsible'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export function NavGrupo({
  titulo,
  aberto,
  onAbertoChange,
  anima,
  triggerClassName,
  children,
}: {
  titulo: string
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
  anima: boolean
  triggerClassName?: string
  children: React.ReactNode
}) {
  return (
    <Collapsible.Root open={aberto} onOpenChange={onAbertoChange} className="space-y-0.5">
      <Collapsible.Trigger
        className={cn(
          'flex w-full items-center justify-between pb-0.5 text-[0.6rem] font-medium tracking-[0.12em] uppercase transition-colors',
          triggerClassName,
        )}
      >
        {titulo}
        <ChevronDown
          className={cn(
            'size-3 duration-200 ease-out motion-reduce:transition-none',
            anima ? 'transition-transform' : 'transition-none',
            !aberto && '-rotate-90',
          )}
        />
      </Collapsible.Trigger>
      <Collapsible.Panel
        className={cn(
          'h-[var(--collapsible-panel-height)] overflow-hidden duration-200 ease-out motion-reduce:transition-none',
          anima ? 'transition-[height,opacity]' : 'transition-none',
          'data-starting-style:h-0 data-starting-style:opacity-0',
          'data-ending-style:h-0 data-ending-style:opacity-0',
        )}
      >
        {/* Wrapper interno: o espaçamento fica aqui pra não entrar na
            altura animada do painel. */}
        <div className="space-y-0.5">{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
