import { z } from 'zod'

// Preço unitário obrigatório (>= 0), aceita vírgula. Guardado como string
// (numeric).
const preco = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.'))
  .refine(
    (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0,
    'Preço inválido',
  )

export const orcamentoItemSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(2, 'Descrição muito curta')
    .max(200, 'Descrição muito longa'),
  quantidade: z.coerce
    .number()
    .int('Quantidade inválida')
    .min(1, 'Mínimo 1')
    .max(999999, 'Quantidade muito alta'),
  precoUnitario: preco,
})

export const orcamentoSchema = z.object({
  cliente: z
    .string()
    .trim()
    .min(2, 'Informe o cliente')
    .max(120, 'Nome muito longo'),
  observacao: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))
    .optional(),
  itens: z.array(orcamentoItemSchema).min(1, 'Adicione ao menos um item'),
})

export type OrcamentoInput = z.input<typeof orcamentoSchema>
export type OrcamentoItemInput = z.input<typeof orcamentoItemSchema>
