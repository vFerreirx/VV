import { z } from 'zod'

// Peso padrão por caixa (kg) — usado só pra calcular o peso sugerido na
// tela; o valor real gravado é `pesoTotalKg`, que o usuário pode ajustar.
export const PESO_PADRAO_CAIXA_KG = 32

const uuidCampo = z.string().uuid('Selecione uma opção válida')

const textoLivreOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))
  .optional()

const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')

// Valor monetário/peso obrigatório (> 0). Guardado como string (numeric).
const decimalPositivoObrigatorio = (mensagem: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(',', '.'))
    .refine(
      (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0,
      mensagem,
    )

// -----------------------------------------------------------------
// Cor do fornecedor (de-para)
// -----------------------------------------------------------------

export const corFornecedorSchema = z.object({
  nomeFornecedor: z
    .string()
    .trim()
    .min(1, 'Informe o nome/código da cor do fornecedor')
    .max(120, 'Nome muito longo'),
  corId: uuidCampo,
  ativo: z.boolean().default(true),
})

export type CorFornecedorInput = z.input<typeof corFornecedorSchema>
export type CorFornecedorOutput = z.output<typeof corFornecedorSchema>

// -----------------------------------------------------------------
// Entrada de lote de fio
// -----------------------------------------------------------------

export const loteFioSchema = z.object({
  numeroLote: z
    .string()
    .trim()
    .min(1, 'Informe o número/código do lote')
    .max(60, 'Número de lote muito longo'),
  corFornecedorId: uuidCampo,
  caixas: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, 'Informe um número de caixas válido'),
  pesoTotalKg: decimalPositivoObrigatorio('Informe o peso total do lote'),
  valorTotal: decimalPositivoObrigatorio('Informe o valor total do lote'),
  vendedor: z.string().trim().min(1, 'Informe o vendedor').max(120),
  dataEntrada: dataSchema,
  vencimentoPagamento: dataSchema,
  notaFiscal: textoLivreOpt,
  observacao: textoLivreOpt,
})

export type LoteFioInput = z.input<typeof loteFioSchema>
export type LoteFioOutput = z.output<typeof loteFioSchema>
