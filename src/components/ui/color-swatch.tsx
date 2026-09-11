// O SWATCH DE COR DO CATÁLOGO.
//
// Morava dentro de `/cores/cores-list.tsx`, onde servia pra conferir
// cadastro. Saiu de lá porque ganhou um segundo uso muito mais importante:
// na fila do operador, a cor é O QUE ELE CONFERE CONTRA O FIO QUE ESTÁ NA
// MÁQUINA. Duplicar o componente deixaria os dois desenhos divergirem — e é
// o mesmo objeto do mundo real sendo mostrado nas duas telas.
//
// ⚠️ BICOLOR É DIAGONAL, e não duas metades lado a lado: 13 das 42 cores do
// catálogo têm `codigoHex2` ("Areia e Azul Marinho"), e a diagonal é o que
// já foi cadastrado e conferido em /cores.
//
// Sem hex nenhum vira quadrado tracejado — "não sei a cor" tem que parecer
// diferente de "a cor é branca".

import { cn } from '@/lib/utils'

const TAMANHOS = {
  sm: 'size-7 rounded-md',
  // 48px. Na fila do operador o swatch é a âncora do olho: ele varre uma
  // coluna de cores em vez de ler vinte nomes de produto parecidos.
  lg: 'size-12 rounded-lg',
} as const

export function ColorSwatch({
  hex,
  hex2,
  tamanho = 'sm',
  className,
}: {
  hex: string | null
  hex2?: string | null
  tamanho?: keyof typeof TAMANHOS
  className?: string
}) {
  const base = cn(TAMANHOS[tamanho], 'shrink-0', className)

  if (!hex && !hex2) {
    return (
      <div
        className={cn(base, 'border border-dashed')}
        aria-label="Sem cor definida"
      />
    )
  }
  // Bicolor: swatch dividido na diagonal entre as duas tonalidades.
  if (hex && hex2) {
    return (
      <div
        className={cn(base, 'ring-foreground/10 border ring-1')}
        style={{
          background: `linear-gradient(135deg, ${hex} 0 50%, ${hex2} 50% 100%)`,
        }}
        aria-label={`${hex} / ${hex2}`}
      />
    )
  }
  const cor = hex ?? hex2!
  return (
    <div
      className={cn(base, 'ring-foreground/10 border ring-1')}
      style={{ backgroundColor: cor }}
      aria-label={cor}
    />
  )
}
