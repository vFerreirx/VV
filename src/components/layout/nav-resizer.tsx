'use client'

// Borda arrastável dos painéis de navegação: a sidebar do desktop e a
// gaveta do mobile. Mesmo gesto, mesma faixa por alvo (ver LARGURAS).
//
// Durante o arrasto a largura vai DIRETO pro CSS var do painel, sem passar
// pelo React: um setState por pointermove re-renderizaria a lista inteira
// de itens ~60x por segundo. O estado (e o cookie) só são atualizados
// quando o ponteiro solta.
//
// `touch-none`: sem isso, no celular o navegador entende o gesto como
// scroll da gaveta e o arrasto nunca chega aqui.

import { useCallback, useRef } from 'react'

import {
  LARGURAS,
  naFaixa,
  type AlvoLargura,
} from '@/components/layout/sidebar-cookie'
import { useSidebar } from '@/components/layout/sidebar-estado'
import { cn } from '@/lib/utils'

const PASSO = 16

export function NavResizer({
  alvo,
  alvoRef,
  pega = false,
}: {
  alvo: AlvoLargura
  alvoRef: React.RefObject<HTMLElement | null>
  /** Mostra uma pega sempre visível — no toque não existe hover. */
  pega?: boolean
}) {
  const { larguras, definirLargura } = useSidebar()
  const largura = larguras[alvo]
  const { variavel, min, max, padrao, fracaoDaTela } = LARGURAS[alvo]
  // Largura viva durante o arrasto: o `largura` do contexto fica congelado
  // enquanto não há re-render.
  const vivo = useRef(largura)

  const teto = useCallback(
    () =>
      fracaoDaTela
        ? Math.min(max, Math.round(window.innerWidth * fracaoDaTela))
        : max,
    [fracaoDaTela, max],
  )

  const aplicar = useCallback(
    (px: number) => {
      const nova = naFaixa(alvo, px, teto())
      vivo.current = nova
      alvoRef.current?.style.setProperty(variavel, `${nova}px`)
    },
    [alvo, alvoRef, teto, variavel],
  )

  function onPointerDown(evento: React.PointerEvent<HTMLDivElement>) {
    const painel = alvoRef.current
    if (evento.button !== 0 || !painel) return
    evento.preventDefault()

    vivo.current = largura
    // Trava a transição de largura: com ela ligada a borda ficaria
    // perseguindo o ponteiro com 200ms de atraso.
    painel.dataset.arrastando = ''
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const esquerda = painel.getBoundingClientRect().left

    // Ouvindo na window, e não com setPointerCapture no puxador: a captura
    // lança quando o ponteiro não está mais ativo, e como ela viria antes
    // de registrar o `soltar`, o painel ficaria preso em `data-arrastando`
    // com o cursor de resize grudado na página.
    const mover = (ev: PointerEvent) => aplicar(ev.clientX - esquerda)
    const soltar = () => {
      delete painel.dataset.arrastando
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
      definirLargura(alvo, vivo.current, teto())
    }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
  }

  function onKeyDown(evento: React.KeyboardEvent<HTMLDivElement>) {
    const destino =
      evento.key === 'ArrowLeft'
        ? largura - PASSO
        : evento.key === 'ArrowRight'
          ? largura + PASSO
          : evento.key === 'Home'
            ? padrao
            : null
    if (destino == null) return
    evento.preventDefault()
    definirLargura(alvo, destino, teto())
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar menu"
      aria-valuenow={largura}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => definirLargura(alvo, padrao)}
      title="Arraste pra redimensionar (duplo clique volta ao padrão)"
      className={cn(
        'group/resize absolute inset-y-0 right-0 z-10 cursor-col-resize touch-none focus-visible:outline-none',
        // No toque o alvo precisa ser maior que os 8px do mouse.
        pega ? 'w-5' : 'w-2',
      )}
    >
      <span
        aria-hidden
        // `bg-transparent` (e não `bg-sidebar-primary/0`): com uma cor de
        // alfa zero o valor difere do inicial do navegador e o traço
        // dispara uma transição transparente→transparente ao montar.
        className="group-hover/resize:bg-sidebar-primary/40 group-focus-visible/resize:bg-sidebar-primary absolute inset-y-0 right-0 w-0.5 bg-transparent transition-colors"
      />
      {pega && (
        <span
          aria-hidden
          className="bg-border absolute top-1/2 right-1 h-10 w-1 -translate-y-1/2 rounded-full"
        />
      )}
    </div>
  )
}
