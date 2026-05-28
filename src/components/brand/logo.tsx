import { cn } from '@/lib/utils'

/**
 * Logo da Vanvest renderizada como SVG inline.
 *
 * 3 variantes:
 *  - `full`    moldura + V dourado + texto "HOME DECOR". Pra hero/login.
 *  - `mark`    só a moldura + V. Pra sidebar/favicon (formato quadrado).
 *  - `word`    apenas o wordmark "VANVEST" em uppercase + opcional sub.
 *
 * Cores ligadas a CSS vars do tema (tokens primary/accent/foreground)
 * pra acompanhar light/dark mode automaticamente.
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
  if (variant === 'word') return <Wordmark className={className} showTagline={showTagline} ariaLabel={ariaLabel} />
  if (variant === 'full') return <Full className={className} ariaLabel={ariaLabel} />
  return <Mark className={className} ariaLabel={ariaLabel} />
}

// -----------------------------------------------------------------
// Mark — moldura cinza com o "V" dourado dentro. ViewBox 100x100.
// -----------------------------------------------------------------

function Mark({
  className,
  ariaLabel,
}: {
  className?: string
  ariaLabel: string
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={ariaLabel}
      className={cn('inline-block', className)}
    >
      {/* Moldura: retângulo aberto na parte inferior (formato U invertido) */}
      <path
        d="M 14 42 L 14 22 L 86 22 L 86 42"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="square"
      />
      {/* "V" dourado formado por duas linhas que se cruzam ligeiramente.
          Cada linha vai de uma das pontas superiores e desce passando
          pelo centro-baixo — o cruzamento delas forma o V duplo. */}
      <path
        d="M 24 44 L 60 92"
        fill="none"
        stroke="var(--logo-accent, #d9c167)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M 76 44 L 40 92"
        fill="none"
        stroke="var(--logo-accent, #d9c167)"
        strokeWidth="7"
        strokeLinecap="round"
      />
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
      className={cn('inline-flex flex-col leading-none', className)}
    >
      <span className="font-heading text-current font-medium tracking-[0.18em] uppercase">
        Vanvest
      </span>
      {showTagline && (
        <span className="text-muted-foreground mt-0.5 text-[0.55em] tracking-[0.3em] uppercase">
          Home Decor
        </span>
      )}
    </span>
  )
}

// -----------------------------------------------------------------
// Full — composição usada no login (mark grande + wordmark embaixo).
// -----------------------------------------------------------------

function Full({
  className,
  ariaLabel,
}: {
  className?: string
  ariaLabel: string
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn('flex flex-col items-center gap-3', className)}
    >
      <Mark className="text-foreground size-20" ariaLabel="" />
      <Wordmark
        showTagline
        className="text-foreground text-2xl"
        ariaLabel=""
      />
    </div>
  )
}
