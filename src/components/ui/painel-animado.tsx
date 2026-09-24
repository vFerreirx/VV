'use client'

// O ABRIR E FECHAR DOS BLOCOS DE OP — o "Iniciar" do tablet e as pastas do
// kanban, num lugar só: o gerente e o operador abrem a mesma coisa, no mesmo
// ritmo. (O menu lateral, nav-grupo.tsx, tem o dele, mais curto: é navegação.)
//
// É o Collapsible do Base UI. O painel publica a própria altura
// (`--collapsible-panel-height`), ela anima nas duas direções sem medir nada
// na mão, e o conteúdo só desmonta depois que o fechar termina — com
// `{aberto && ...}` o bloco estalava: o conteúdo inteiro aparecia de uma vez
// e o que estava embaixo pulava. Depois de aberto, a altura volta a `auto`,
// então o conteúdo pode mudar (a busca do tablet) sem ser cortado. Painel que
// já NASCE aberto não anima: o Base UI cancela de propósito.
//
// 250ms numa curva que desacelera no fim: na metade do tempo 96% do conteúdo
// já está na tela, e o fim macio é o que tira o "seco". Mais longo vira
// espera no chão de fábrica — o mesmo motivo dos 180ms das listas
// (use-lista-animada.ts).
//
// ⚠️ O "reduzir movimento" tira só a `transition-property`, NUNCA a duração:
// o Collapsible lê a duração do painel UMA vez pra decidir se anima (ver
// nav-grupo.tsx). Duração zero ali desligaria a animação pro resto da sessão.

import { Collapsible } from '@base-ui/react/collapsible'

import { cn } from '@/lib/utils'

/** O ritmo do painel. A seta que gira usa o mesmo, pra chegarem juntas. */
export const RITMO_DO_PAINEL =
  'duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'

/**
 * O `Collapsible.Panel` com a animação de altura e fade. Vai dentro de um
 * `Collapsible.Root`, como qualquer painel do Base UI.
 */
export function PainelAnimado({
  className,
  ...props
}: Omit<Collapsible.Panel.Props, 'className'> & { className?: string }) {
  return (
    <Collapsible.Panel
      className={cn(
        'h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity]',
        RITMO_DO_PAINEL,
        'data-starting-style:h-0 data-starting-style:opacity-0',
        'data-ending-style:h-0 data-ending-style:opacity-0',
        className,
      )}
      {...props}
    />
  )
}
