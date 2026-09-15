import { z } from 'zod'

import { erroDoProducaoAte } from '@/lib/producao/prazo-da-remessa'

export const fullCanalImportValues = ['full_ml', 'full_shopee'] as const

// Componentes de um código: o que a fábrica produz por UNIDADE do envio.
export const deParaComponenteSchema = z.object({
  variacaoId: z.uuid('Escolha a variação'),
  quantidade: z
    .number()
    .int('Quantidade tem que ser inteira')
    .min(1, 'Quantidade mínima é 1')
    .max(99, 'Quantidade máxima é 99'),
})

export const deParaSchema = z.object({
  canal: z.enum(fullCanalImportValues),
  codigo: z.string().trim().min(1, 'Código é obrigatório').max(120),
  // Só referência pra pré-selecionar o kit ao reabrir; os componentes é que
  // valem.
  kitId: z.uuid().nullable().optional(),
  // SKU/descrição vistos no PDF agora — é o que faz o aviso de "mudou desde
  // o último mapeamento" funcionar no envio seguinte.
  skuVisto: z.string().trim().max(200).nullable().optional(),
  descricaoVista: z.string().trim().max(500).nullable().optional(),
  componentes: z.array(deParaComponenteSchema).min(1, 'Informe ao menos um componente'),
})

export type DeParaInput = z.infer<typeof deParaSchema>

// Confirmação da importação. As quantidades já vêm resolvidas do servidor;
// o cliente manda só o que a pessoa escolheu (remessa e prioridade) e o
// envio que ele acabou de conferir.
export const importarFullSchema = z
  .object({
    // Full existente; se ausente, cria um novo com canal + dataEnvio.
    remessaId: z.uuid().nullable().optional(),
    // Conta de marketplace do envio. O PDF não diz qual é — nem o do ML nem
    // a Picking List da Shopee —, então vem escolhida da tela. Obrigatória
    // só quando cria um Full novo; usando um existente, a conta é a dele.
    contaId: z.uuid().nullable().optional(),
    dataEnvio: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .nullable()
      .optional(),
    // Prazo da produção do Full NOVO. Nulo = padrão (envio menos a folga).
    producaoAte: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .nullable()
      .optional(),
    canal: z.enum(fullCanalImportValues),
    envioId: z.string().trim().max(80).nullable().optional(),
    prioridade: z.enum(['baixa', 'normal', 'alta', 'urgente']),
    // O que produzir, já explodido e somado por variação.
    itens: z
      .array(
        z.object({
          variacaoId: z.uuid(),
          quantidade: z.number().int().min(1),
        }),
      )
      .min(1, 'Nada pra produzir'),
    // Conferência de integridade: o total que a tela mostrou. O servidor
    // recalcula e recusa se não bater — protege contra a tela ficar velha.
    totalPecas: z.number().int().min(1),
  })
  .refine((d) => d.remessaId || d.contaId, {
    message: 'Escolha a conta de marketplace do envio',
  })
  // A MESMA REGRA DA TELA (prazo-da-remessa.ts). Só vale pro Full novo.
  .superRefine((d, ctx) => {
    if (d.remessaId || !d.dataEnvio) return
    const erro = erroDoProducaoAte(d.dataEnvio, d.producaoAte ?? null)
    if (erro) ctx.addIssue({ code: 'custom', message: erro, path: ['producaoAte'] })
  })

export type ImportarFullInput = z.infer<typeof importarFullSchema>
