import { z } from 'zod'

import { canalValues, prioridadeValues } from './ordens'

const uuid = z.string().uuid('Item inválido')

export const kitItemSchema = z.object({
  produtoId: uuid,
  quantidade: z.coerce
    .number()
    .int('Quantidade inválida')
    .min(1, 'Mínimo 1')
    .max(9999, 'Quantidade muito alta'),
})

export const kitSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(120, 'Nome muito longo'),
  sku: z.string().trim().min(1, 'Informe o SKU').max(60, 'SKU muito longo'),
  descricao: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))
    .optional(),
  ativo: z.boolean().default(true),
  itens: z.array(kitItemSchema).min(1, 'Adicione ao menos um item ao kit'),
})

// Gerar OPs dos componentes a partir de um kit. A escolha de tamanho/cor
// (a variação) de cada item do kit vem aqui, na geração.
export const gerarOpsKitSchema = z.object({
  kitId: uuid,
  quantidade: z.coerce
    .number()
    .int('Quantidade inválida')
    .min(1, 'Mínimo 1 kit')
    .max(99999, 'Quantidade muito alta'),
  canalDestino: z.enum(canalValues),
  prioridade: z.enum(prioridadeValues),
  // Uma variação escolhida por item do kit (kitItemId -> variacaoId).
  escolhas: z
    .array(z.object({ kitItemId: uuid, variacaoId: uuid }))
    .min(1, 'Escolha tamanho e cor de cada item'),
})

export type KitInput = z.input<typeof kitSchema>
export type KitItemInput = z.input<typeof kitItemSchema>
export type GerarOpsKitInput = z.input<typeof gerarOpsKitSchema>
