'use client'

// Borda arrastável da sidebar.
//
// Durante o arrasto a largura vai DIRETO pro CSS var da <aside>, sem passar
// pelo React: um setState por pointermove re-renderizaria a lista inteira
// de itens ~60x por segundo. O estado (e o cookie) só são atualizados
// quando o ponteiro solta.

import { useCallback, useRef } from 'react'

import {
  LARGURA_MAX,
  LARGURA_MIN,
  LARGURA_PADRAO,
  larguraNaFaixa,
} from '@/components/layout/sidebar-cookie'
import { useSidebar } from '@/components/layout/sidebar-estado'

const PASSO = 16

export function SidebarResizer({
  alvoRef,
}: {
  alvoRef: React.RefObject<HTMLElement | null>
}) {
  const { largura, definirLargura } = useSidebar()
  // Largura viva durante o arrasto: o `largura` do contexto fica congelado
  // enquanto não há re-render.
  const vivo = useRef(largura)

  const aplicar = useCallback(
    (px: number) => {
      const nova = larguraNaFaixa(px)
      vivo.current = nova
      alvoRef.current?.style.setProperty('--vv-sidebar-w', `${nova}px`)
    },
    [alvoRef],
  )

  function onPointerDown(evento: React.PointerEvent<HTMLDivElement>) {
    const aside = alvoRef.current
    if (evento.button !== 0 || !aside) return
    evento.preventDefault()

    vivo.current = largura
    // Trava a transição de largura: com ela ligada a borda ficaria
    // perseguindo o ponteiro com 200ms de atraso.
    aside.dataset.arrastando = ''
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const puxador = evento.currentTarget
    puxador.setPointerCapture(evento.pointerId)
    const esquerda = aside.getBoundingClientRect().left

    const mover = (ev: PointerEvent) => aplicar(ev.clientX - esquerda)
    const soltar = () => {
      delete aside.dataset.arrastando
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      puxador.removeEventListener('pointermove', mover)
      puxador.removeEventListener('pointerup', soltar)
      puxador.removeEventListener('pointercancel', soltar)
      definirLargura(vivo.current)
    }

    puxador.addEventListener('pointermove', mover)
    puxador.addEventListener('pointerup', soltar)
    puxador.addEventListener('pointercancel', soltar)
  }

  function onKeyDown(evento: React.KeyboardEvent<HTMLDivElement>) {
    const alvo =
      evento.key === 'ArrowLeft'
        ? largura - PASSO
        : evento.key === 'ArrowRight'
          ? largura + PASSO
          : evento.key === 'Home'
            ? LARGURA_PADRAO
            : null
    if (alvo == null) return
    evento.preventDefault()
    definirLargura(alvo)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar menu"
      aria-valuenow={largura}
      aria-valuemin={LARGURA_MIN}
      aria-valuemax={LARGURA_MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => definirLargura(LARGURA_PADRAO)}
      title="Arraste pra redimensionar (duplo clique volta ao padrão)"
      className="group/resize absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none"
    >
      <span
        aria-hidden
        className="bg-sidebar-primary/0 group-hover/resize:bg-sidebar-primary/40 group-focus-visible/resize:bg-sidebar-primary absolute inset-y-0 right-0 w-0.5 transition-colors"
      />
    </div>
  )
}
