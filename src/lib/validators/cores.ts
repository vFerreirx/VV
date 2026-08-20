import { z } from 'zod'

// Hex de 3 ou 6 dígitos com # opcional → normaliza pra '#RRGGBB' minúsculo.
const hexSchema = z
  .string()
  .trim()
  .regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use formato hex válido (ex: #FF5500 ou FF5)')
  .transform((v) => {
    const cleaned = v.startsWith('#') ? v.slice(1) : v
    const expanded =
      cleaned.length === 3
        ? cleaned
            .split('')
            .map((c) => c + c)
            .join('')
        : cleaned
    return `#${expanded.toLowerCase()}`
  })

export const corSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(60, 'Nome muito longo'),
  // Aceita hex válido, '' , null ou ausente (o cliente transforma vazio em
  // null antes de mandar pro servidor — sem z.null() o servidor rejeitava).
  codigoHex: z
    .union([hexSchema, z.literal(''), z.null()])
    .optional()
    .transform((v) => (v && v !== '' ? v : null)),
  // Segunda tonalidade (cores bicolor). Opcional, mesmo formato do hex 1.
  codigoHex2: z
    .union([hexSchema, z.literal(''), z.null()])
    .optional()
    .transform((v) => (v && v !== '' ? v : null)),
  ativo: z.boolean().default(true),
})

export type CorInput = z.input<typeof corSchema>
export type CorOutput = z.output<typeof corSchema>
