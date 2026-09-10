'use client'

// A TECLA DO TECLADO NUMÉRICO DA ESTAÇÃO.
//
// 64px (`h-16`), e esse número não encolhe. É a medida de onde o dedo digita
// com a mão em movimento, com fiapo de linha e luz de galpão — o lugar onde
// errar o alvo custa caro. O cartão da máquina usa 48px porque cartão é
// leitura; aqui é digitação.
//
// Mora em components/ui porque tem DOIS teclados na tela do operador: o de
// concluir produção e o do PIN de troca de operador. Enquanto era uma função
// local do painel, o segundo teria virado uma cópia — e teclas de tamanhos
// diferentes na mesma tela são o tipo de divergência que ninguém percebe até
// alguém errar o dígito.

export function TeclaNumerica({
  children,
  onClick,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="bg-muted hover:bg-muted/70 focus-visible:ring-ring active:bg-muted/50 flex h-16 items-center justify-center rounded-xl text-2xl font-semibold disabled:opacity-50 focus-visible:ring-4 focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
