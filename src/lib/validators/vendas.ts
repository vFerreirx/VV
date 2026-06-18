import { z } from 'zod'

const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine((v) => v === undefined || v.length <= max, `${label} muito longo`)
    .optional()

const intNaoNeg = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' ? 0 : Number(v)))
  .refine((v) => Number.isInteger(v) && v >= 0, 'Informe um inteiro >= 0')

// Valor monetário opcional (>= 0). Guardado como string (numeric).
const valorOpt = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === '') return null
    return String(v).replace(',', '.')
  })
  .refine(
    (v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    'Valor inválido',
  )
  .optional()

export const vendaDiaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  quantidade: intNaoNeg,
  faturamento: valorOpt,
  observacao: stringOpt(300, 'Observação'),
})

export type VendaDiaInput = z.input<typeof vendaDiaSchema>
