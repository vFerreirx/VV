import { z } from 'zod'

const stringOpt = (max: number, label = 'Texto') =>
  z
    .string()
    .max(max, `${label} muito longo`)
    .optional()
    .or(z.literal('').transform(() => undefined))

export const modeloSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(80, 'Nome muito longo'),
  descricao: stringOpt(300, 'Descrição'),
  ativo: z.boolean().default(true),
})

export type ModeloInput = z.input<typeof modeloSchema>
export type ModeloOutput = z.output<typeof modeloSchema>
