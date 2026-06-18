import { z } from 'zod'

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine((v) => v === undefined || v.length <= max, `${label} muito longo`)
    .optional()

const uuidOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' || v === 'nenhuma' ? null : v))
  .refine((v) => v === null || uuidRe.test(v), 'ID inválido')
  .optional()

// Canais de venda (estoque não é canal de venda).
export const vendaCanalValues = [
  'full_ml',
  'full_shopee',
  'venda_direta',
] as const

export const vendaSchema = z.object({
  produtoId: z.string().refine((v) => uuidRe.test(v), 'Selecione um produto'),
  variacaoId: uuidOpt,
  quantidade: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? 0 : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, 'Informe um inteiro > 0'),
  canal: z.enum(vendaCanalValues),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  observacao: stringOpt(200, 'Observação'),
})

export type VendaInput = z.input<typeof vendaSchema>
