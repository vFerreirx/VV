import { z } from 'zod'

const intReq = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .refine((v) => Number.isInteger(v) && v >= 0, 'Informe um inteiro >= 0')

export const tamanhoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Nome muito curto')
    .max(40, 'Nome muito longo'),
  ordem: intReq,
  ativo: z.boolean().default(true),
})

export type TamanhoInput = z.input<typeof tamanhoSchema>
export type TamanhoOutput = z.output<typeof tamanhoSchema>
