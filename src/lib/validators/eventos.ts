import { z } from 'zod'

// String opcional à prova de chave ausente (a Server Action do Next descarta
// undefined — sem .optional() o Zod 4 falha com "expected nonoptional").
const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine((v) => v === undefined || v.length <= max, `${label} muito longo`)
    .optional()

export const eventoFullCanalValues = ['full_ml', 'full_shopee'] as const

export const eventoFullSchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  canal: z.enum(eventoFullCanalValues),
  observacao: stringOpt(300, 'Observação'),
})

export type EventoFullInput = z.input<typeof eventoFullSchema>

export const EVENTO_FULL_CANAL_LABEL: Record<
  (typeof eventoFullCanalValues)[number],
  string
> = {
  full_ml: 'Full Mercado Livre',
  full_shopee: 'Full Shopee',
}

export const EVENTO_FULL_CANAL_CURTO: Record<
  (typeof eventoFullCanalValues)[number],
  string
> = {
  full_ml: 'Full ML',
  full_shopee: 'Full Shopee',
}
