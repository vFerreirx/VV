"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {/* Antes das abas no DOM: as duas são posicionadas, então a que vem
          depois pinta por cima. É o que mantém o texto da aba legível sobre
          o indicador sem precisar espalhar z-index. */}
      <TabsIndicator />
      {children}
    </TabsPrimitive.List>
  )
}

// Indicador deslizante. O Base UI publica a posição e o tamanho da aba ativa
// em CSS vars (--active-tab-left/top/width/height) no style do próprio
// elemento; a gente só posiciona por elas e deixa a transition fazer o
// resto. Antes disso a aba ativa só acendia um fundo e um `after:` — piscava
// de uma pra outra em vez de deslizar.
//
// `translate` (a propriedade CSS, não o transform do Tailwind) em vez de
// left/top: anima no compositor e não força layout a cada frame.
//
// `renderBeforeHydration` injeta um script que posiciona o indicador antes
// do React hidratar — sem isso ele aparece do nada depois do SSR.
function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      data-slot="tabs-indicator"
      renderBeforeHydration
      className={cn(
        "pointer-events-none absolute top-0 left-0 transition-[translate,width,height] duration-200 ease-out motion-reduce:transition-none",
        // Variante `default`: a pílula ocupa a aba inteira.
        "group-data-[variant=default]/tabs-list:h-[var(--active-tab-height)] group-data-[variant=default]/tabs-list:w-[var(--active-tab-width)] group-data-[variant=default]/tabs-list:[translate:var(--active-tab-left)_var(--active-tab-top)]",
        "group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:bg-background group-data-[variant=default]/tabs-list:shadow-sm dark:group-data-[variant=default]/tabs-list:border dark:group-data-[variant=default]/tabs-list:border-input dark:group-data-[variant=default]/tabs-list:bg-input/30",
        // Variante `line`: um traço colado na borda da aba — embaixo quando
        // horizontal, à direita quando vertical.
        "group-data-[variant=line]/tabs-list:bg-foreground",
        "group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:h-0.5 group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:w-[var(--active-tab-width)] group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:[translate:var(--active-tab-left)_calc(var(--active-tab-top)_+_var(--active-tab-height))]",
        "group-data-[variant=line]/tabs-list:group-data-vertical/tabs:h-[var(--active-tab-height)] group-data-[variant=line]/tabs-list:group-data-vertical/tabs:w-0.5 group-data-[variant=line]/tabs-list:group-data-vertical/tabs:[translate:calc(var(--active-tab-left)_+_var(--active-tab-width))_var(--active-tab-top)]",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // `relative` sem z-index: como a aba vem depois do indicador no DOM,
        // isso basta pra ela pintar por cima dele.
        //
        // O fundo e o sublinhado do estado ativo saíram daqui — quem desenha
        // os dois agora é o TabsIndicator, e manter os dois empilhados
        // deixaria a pílula antiga piscando embaixo da que desliza. Aqui fica
        // só o que é da aba: cor do texto, foco e ícone.
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:text-foreground dark:data-active:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export {
  Tabs,
  TabsList,
  TabsIndicator,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
}
