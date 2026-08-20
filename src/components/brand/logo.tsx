import { cn } from '@/lib/utils'

/**
 * Logo da Vanvest — monograma "VV" (duplo V) inspirado em marcas de
 * decoração high-end (Bottega, Vogue): dois Vs lado a lado com leve
 * sobreposição no topo, serifas finas nas pontas e uma baseline
 * editorial embaixo.
 *
 * 3 variantes:
 *  - `full`    monograma grande + wordmark "VANVEST" + tagline. Pra hero/login.
 *  - `mark`    só o monograma "VV". Pra sidebar/favicon/PWA (formato quadrado).
 *  - `word`    apenas o wordmark "VANVEST" em uppercase + tagline opcional.
 *
 * Cor do monograma vem do CSS var `--logo-accent` (dourado champagne) —
 * acompanha light/dark mode automaticamente.
 */

type Variant = 'full' | 'mark' | 'word'

type Props = {
  variant?: Variant
  className?: string
  /** Mostra a tagline "HOME DECOR" abaixo do wordmark */
  showTagline?: boolean
  'aria-label'?: string
}

export function Logo({
  variant = 'mark',
  className,
  showTagline = false,
  'aria-label': ariaLabel = 'Vanvest',
}: Props) {
  if (variant === 'word')
    return <Wordmark className={className} showTagline={showTagline} ariaLabel={ariaLabel} />
  if (variant === 'full') return <Full className={className} ariaLabel={ariaLabel} />
  return <Mark className={className} ariaLabel={ariaLabel} />
}

// -----------------------------------------------------------------
// Mark — monograma VV duplo, dourado. ViewBox 100x100.
// -----------------------------------------------------------------

function Mark({ className, ariaLabel }: { className?: string; ariaLabel: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={ariaLabel}
      className={cn('inline-block', className)}
    >
      <g
        fill="none"
        stroke="var(--logo-accent, #d9c167)"
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        {/* V1 — V esquerdo (vai de cima-esquerda até cima-meio) */}
        <path d="M 12 22 L 40 78 L 68 22" strokeWidth="3.5" />
        {/* V2 — V direito, deslocado: cruza o V1 nos diagonais do meio */}
        <path d="M 32 22 L 60 78 L 88 22" strokeWidth="3.5" />

        {/* Serifas finas nos 4 cantos superiores (toque high-end) */}
        <path d="M 7 22 L 17 22" strokeWidth="1.4" />
        <path d="M 27 22 L 37 22" strokeWidth="1.4" />
        <path d="M 63 22 L 73 22" strokeWidth="1.4" />
        <path d="M 83 22 L 93 22" strokeWidth="1.4" />

        {/* Baseline editorial embaixo */}
        <path d="M 22 90 L 78 90" strokeWidth="1" opacity="0.5" />
      </g>
    </svg>
  )
}

// -----------------------------------------------------------------
// Wordmark — texto "VANVEST" (opcionalmente "HOME DECOR" abaixo).
// -----------------------------------------------------------------

function Wordmark({
  className,
  showTagline,
  ariaLabel,
}: {
  className?: string
  showTagline?: boolean
  ariaLabel: string
}) {
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn('inline-flex flex-col items-center leading-none', className)}
    >
      {/* pl compensa o espaço extra que o letter-spacing adiciona à direita,
          centralizando os glifos de fato (senão a linha fica deslocada). */}
      <span className="font-heading pl-[0.22em] font-medium tracking-[0.22em] text-current uppercase">
        Vanvest
      </span>
      {showTagline && (
        <span className="text-muted-foreground mt-0.5 pl-[0.32em] text-[0.55em] tracking-[0.32em] uppercase">
          Home Decor
        </span>
      )}
    </span>
  )
}

// -----------------------------------------------------------------
// Full — composição usada no login (mark grande + wordmark embaixo).
// -----------------------------------------------------------------

function Full({ className, ariaLabel }: { className?: string; ariaLabel: string }) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('flex flex-col items-center gap-3', className)}
    >
      <Mark className="text-foreground size-20" ariaLabel="" />
      <Wordmark showTagline className="text-foreground text-2xl" ariaLabel="" />
    </div>
  )
}
