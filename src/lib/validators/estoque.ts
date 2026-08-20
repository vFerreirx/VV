import { z } from 'zod'

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// String opcional à prova de chave ausente (Server Action descarta undefined).
const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine((v) => v === undefined || v.length <= max, `${label} muito longo`)
    .optional()

export const sentidoValues = ['entrada', 'saida'] as const

export const movimentacaoEstoqueSchema = z.object({
  produtoId: z.string().refine((v) => uuidRe.test(v), 'Produto inválido'),
  variacaoId: z.string().refine((v) => uuidRe.test(v), 'Variação inválida'),
  sentido: z.enum(sentidoValues),
  quantidade: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? 0 : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, 'Informe um inteiro > 0'),
  observacao: stringOpt(200, 'Observação'),
})

export type MovimentacaoEstoqueInput = z.input<typeof movimentacaoEstoqueSchema>

export const SENTIDO_LABEL: Record<(typeof sentidoValues)[number], string> = {
  entrada: 'Entrada (+)',
  saida: 'Saída (−)',
}
