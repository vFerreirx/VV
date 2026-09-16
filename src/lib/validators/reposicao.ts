import { z } from 'zod'

import { SITUACOES_DE_REPOSICAO } from '@/lib/producao/reposicao'

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (label: string) =>
  z.string().refine((v) => uuidRe.test(v), `${label} inválido`)

// Marcar peças acabando: um produto, várias células da grade, cada uma com a
// própria situação. A observação vale pras células marcadas naquela vez.
//
// ⚠️ CÉLULA POR CÉLULA, sem "linha inteira" nem "coluna inteira": cada item
// da lista é uma variação escolhida de propósito.
export const marcarReposicaoSchema = z
  .object({
    produtoId: uuid('Produto'),
    marcacoes: z
      .array(
        z.object({
          variacaoId: uuid('Variação'),
          situacao: z.enum(SITUACOES_DE_REPOSICAO),
        }),
      )
      .min(1, 'Toque nas peças que estão acabando')
      .max(200, 'Peças demais numa marcação só'),
    observacao: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))
      .refine((v) => v === undefined || v.length <= 300, 'Observação muito longa')
      .optional(),
  })
  .refine(
    (d) => new Set(d.marcacoes.map((m) => m.variacaoId)).size === d.marcacoes.length,
    { message: 'A mesma peça foi marcada duas vezes', path: ['marcacoes'] },
  )

export type MarcarReposicaoInput = z.input<typeof marcarReposicaoSchema>
