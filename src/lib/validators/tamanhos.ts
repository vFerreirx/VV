import { z } from 'zod'

const intReq = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((v) => Number.isInteger(v) && v >= 0, 'Informe um inteiro >= 0')

// Código pro SKU: maiúsculo, só letras/números. Ex.: KING -> "K".
const codigoSku = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) =>
    (v ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ''),
  )
  .refine((v) => v.length <= 12, 'Código muito longo')

export const tamanhoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Nome muito curto')
    .max(40, 'Nome muito longo'),
  codigo: codigoSku,
  ordem: intReq,
  ativo: z.boolean().default(true),
})

export type TamanhoInput = z.input<typeof tamanhoSchema>
export type TamanhoOutput = z.output<typeof tamanhoSchema>
