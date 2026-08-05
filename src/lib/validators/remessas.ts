import { z } from 'zod'

import { prioridadeValues } from './ordens'

const uuid = z.string().uuid('Item inválido')

// Canais que têm remessa Full.
export const fullCanalValues = ['full_ml', 'full_shopee'] as const

export const fullItemSchema = z.object({
  variacaoId: uuid,
  quantidade: z.coerce
    .number()
    .int('Quantidade inválida')
    .min(1, 'Mínimo 1')
    .max(99999, 'Quantidade muito alta'),
})

// Criar OPs dentro de um Full: usa um Full existente (remessaId) OU cria
// um novo (canal + dataEnvio).
export const criarOpsFullSchema = z
  .object({
    remessaId: uuid.optional(),
    canal: z.enum(fullCanalValues).optional(),
    dataEnvio: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .optional(),
    // Conta de marketplace do envio. Obrigatória só quando a remessa é
    // NOVA — usando uma existente, a conta é a dela. Optional aqui e
    // exigida no refine abaixo, porque a coluna no banco é nullable
    // (histórico) e a obrigatoriedade é do formulário.
    contaId: uuid.optional(),
    prioridade: z.enum(prioridadeValues),
    itens: z.array(fullItemSchema).min(1, 'Adicione ao menos um produto'),
  })
  .refine((d) => d.remessaId || (d.canal && d.dataEnvio), {
    message: 'Escolha um Full existente ou informe canal e data de envio',
  })
  .refine((d) => d.remessaId || d.contaId, {
    message: 'Escolha a conta de marketplace do envio',
  })

export type CriarOpsFullInput = z.input<typeof criarOpsFullSchema>
