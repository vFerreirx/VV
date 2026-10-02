import { z } from 'zod'

import { SITUACOES_DE_REPOSICAO } from '@/lib/producao/reposicao'

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (label: string) =>
  z.string().refine((v) => uuidRe.test(v), `${label} inválido`)

// Marcar peças acabando: um produto, várias células da grade, cada uma com a
// própria situação e a QUANTIDADE a produzir. A observação vale pras células
// marcadas naquela vez, e fica no ITEM — não vai pra OP, que o operador lê
// no tablet.
//
// ⚠️ A QUANTIDADE É OBRIGATÓRIA (Q200): quem passa pela prateleira já sabe
// quantas faltam. É ela que vira a quantidade da OP — na hora, quando quem
// marca cria as OPs (`criarOps`), ou depois, no "Produzir" da fila. A coluna
// é nula só nas linhas de antes da 75.
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
          // Mesma regra da quantidade da OP: inteiro > 0. Vem como texto do
          // campo, ou número.
          quantidade: z
            .union([z.string(), z.number()])
            .transform((v) => String(v).trim())
            .refine((v) => v.length > 0, 'Diga quantas produzir de cada peça')
            .refine(
              (v) => /^\d+$/.test(v) && Number(v) >= 1,
              'Quantas produzir: um número inteiro, de 1 pra cima',
            )
            .transform((v) => Number(v)),
        }),
      )
      .min(1, 'Toque nas peças que estão acabando')
      .max(200, 'Peças demais numa marcação só'),
    observacao: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))
      .refine((v) => v === undefined || v.length <= 300, 'Observação muito longa')
      .optional(),
    // Criar as OPs na mesma transação (Q201). Explícito, e não deduzido da
    // permissão: o que o botão diz é o que acontece. Exige escrita em
    // 'ordens' — a action confere.
    criarOps: z.boolean().default(false),
  })
  .refine(
    (d) => new Set(d.marcacoes.map((m) => m.variacaoId)).size === d.marcacoes.length,
    { message: 'A mesma peça foi marcada duas vezes', path: ['marcacoes'] },
  )

export type MarcarReposicaoInput = z.input<typeof marcarReposicaoSchema>
