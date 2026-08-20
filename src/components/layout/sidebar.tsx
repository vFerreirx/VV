'use client'

import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react'

import { logoutAction } from '@/app/(auth)/login/actions'
import { Logo } from '@/components/brand/logo'
import { IndicadorTarefas } from '@/components/layout/indicador-tarefas'
import { NavGrupo } from '@/components/layout/nav-grupo'
import { NavLinkHint } from '@/components/layout/nav-link-hint'
import { visibleGroups } from '@/components/layout/nav-items'
import { SIDEBAR_ID } from '@/components/layout/sidebar-cookie'
import { useSidebar } from '@/components/layout/sidebar-estado'
import { NavResizer } from '@/components/layout/nav-resizer'
import { useNavCollapse } from '@/components/layout/use-nav-collapse'
import type { AreaKey } from '@/lib/auth/permissoes'
import type { PrioridadeAlerta } from '@/lib/prioridade'
import { cn } from '@/lib/utils'

export function Sidebar({
  bloqueadas,
  alertaTarefas,
}: {
  bloqueadas: AreaKey[]
  alertaTarefas: PrioridadeAlerta
}) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const grupos = visibleGroups(bloqueadas)
  const { collapsed, toggle, anima } = useNavCollapse()
  const { oculta, larguras } = useSidebar()

  // Indicator deslizante: mede a posição do item ativo e move a pílula até
  // ele. O fundo do item ativo saiu do próprio <Link> — se ficasse lá, o
  // destaque apareceria instantâneo no destino enquanto a pílula ainda
  // estivesse deslizando, e dois itens ficariam acesos ao mesmo tempo.
  //
  // useLayoutEffect (e não useEffect) porque a medida tem que estar pronta
  // ANTES da primeira pintura: com useEffect o item ativo ficaria um quadro
  // sem nenhum destaque.
  const asideRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const conteudoRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{
    top: number
    height: number
  } | null>(null)
  // A pílula some quando o item ativo está num grupo fechado. Quem decide
  // isso é o estado dos grupos, NÃO a presença do item no DOM: o Collapsible
  // só desmonta o conteúdo no fim da animação de saída, e nesse intervalo o
  // `anima` já teria ligado — o resultado era a pílula dando um fade a cada
  // carregamento com grupo fechado.
  const grupoDoAtivo = grupos.find((grupo) =>
    grupo.items.some(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    ),
  )
  const pilulaVisivel = grupoDoAtivo != null && !collapsed[grupoDoAtivo.titulo]
  // Enquanto os grupos abrem/fecham a pílula é remedida a cada quadro; se
  // ela ainda tivesse a própria transição de `top`, ficaria suavizando uma
  // posição que já é suave e arrastaria ~90px atrás do item. A transição
  // volta quando o nav para de mudar de tamanho — aí ela serve pra deslizar
  // entre um item e outro na troca de rota.
  const [seguindo, setSeguindo] = useState(false)

  const medir = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const ativo = nav.querySelector<HTMLElement>('[data-active="true"]')
    // Sem item ativo medível, guarda a última posição: a pílula sai por
    // opacidade, não pipocando.
    if (!ativo || ativo.offsetHeight === 0) return
    const top = ativo.offsetTop
    const height = ativo.offsetHeight
    setIndicator((prev) =>
      prev && prev.top === top && prev.height === height
        ? prev
        : { top, height },
    )
  }, [])

  useLayoutEffect(() => {
    medir()
  }, [medir, pathname, grupos.length, collapsed, oculta])

  // A pílula tem que ACOMPANHAR a abertura/fechamento dos grupos, não pular
  // pro destino no primeiro quadro enquanto os links ainda deslizam. O
  // <nav> tem altura fixa (flex-1), então quem muda de tamanho é o conteúdo
  // dentro dele — é ele que o ResizeObserver observa. `transitionend`
  // sozinho chegaria tarde demais.
  useEffect(() => {
    const alvo = conteudoRef.current
    if (!alvo) return
    let parada = 0
    const observer = new ResizeObserver(() => {
      setSeguindo(true)
      clearTimeout(parada)
      parada = window.setTimeout(() => setSeguindo(false), 240)
      medir()
    })
    observer.observe(alvo)
    return () => {
      observer.disconnect()
      clearTimeout(parada)
    }
  }, [medir])

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  return (
    <aside
      ref={asideRef}
      id={SIDEBAR_ID}
      data-oculta={oculta || undefined}
      style={
        {
          viewTransitionName: 'vv-sidebar',
          '--vv-sidebar-w': `${larguras.sidebar}px`,
        } as React.CSSProperties
      }
      className={cn(
        'bg-sidebar hidden w-[var(--vv-sidebar-w)] shrink-0 overflow-hidden transition-[width] duration-200 ease-out md:flex data-arrastando:transition-none motion-reduce:transition-none print:hidden',
        oculta && 'w-0',
      )}
    >
      {/* Largura própria aqui dentro: enquanto a <aside> encolhe, o conteúdo
          não reflui (o texto amassaria), só desliza e apaga junto.
          `inert` tira tudo da ordem de tabulação quando oculta — inclusive
          o resizer, que não teria o que redimensionar. */}
      <div
        inert={oculta || undefined}
        className={cn(
          'border-sidebar-border relative flex w-[var(--vv-sidebar-w)] shrink-0 flex-col border-r transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none',
          oculta && '-translate-x-2 opacity-0',
        )}
      >
        <NavResizer alvo="sidebar" alvoRef={asideRef} />
        <div className="border-sidebar-border flex h-14 items-center gap-2.5 border-b px-4">
          <Logo variant="mark" className="text-sidebar-primary size-7" />
          <div className="leading-tight">
            <div className="text-sidebar-foreground font-heading text-sm font-medium tracking-[0.18em] uppercase">
              Vanvest
            </div>
            <div className="text-sidebar-foreground/60 text-[0.55rem] tracking-[0.3em] uppercase">
              Home Decor
            </div>
          </div>
        </div>
        <nav ref={navRef} className="relative flex-1 overflow-y-auto p-2">
          {indicator && (
            <span
              aria-hidden
              className={cn(
                'bg-sidebar-accent pointer-events-none absolute inset-x-2 rounded-md duration-200 ease-out motion-reduce:transition-none',
                anima
                  ? seguindo
                    ? 'transition-[opacity]'
                    : 'transition-[top,height,opacity]'
                  : 'transition-none',
                !pilulaVisivel && 'opacity-0',
              )}
              style={{ top: indicator.top, height: indicator.height }}
            />
          )}
          <div ref={conteudoRef} className="space-y-3">
            {grupos.map((grupo) => (
              <NavGrupo
                key={grupo.titulo}
                titulo={grupo.titulo}
                aberto={!collapsed[grupo.titulo]}
                onAbertoChange={() => toggle(grupo.titulo)}
                anima={anima}
                triggerClassName="text-sidebar-foreground/45 hover:text-sidebar-foreground/70 px-2.5"
              >
                {grupo.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-active={active}
                      className={cn(
                        // `relative`: o item vem depois da pílula no DOM, e
                        // isso basta pra o texto ficar por cima dela.
                        'group/nav relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        active
                          ? 'text-sidebar-accent-foreground font-medium'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
                      )}
                    >
                      <item.icon className="size-4 transition-transform duration-200 group-hover/nav:translate-x-0.5" />
                      {item.label}
                      {item.alerta === 'tarefas' && (
                        <IndicadorTarefas prioridade={alertaTarefas} />
                      )}
                      <NavLinkHint className="ml-auto" />
                    </Link>
                  )
                })}
              </NavGrupo>
            ))}
          </div>
        </nav>
        <div className="border-sidebar-border border-t p-2">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className={cn(
              'text-sidebar-foreground hover:bg-sidebar-accent/50 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              'disabled:pointer-events-none disabled:opacity-60',
            )}
          >
            <LogOut className="size-4" />
            {isPending ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      </div>
    </aside>
  )
}
