import { z } from 'zod'

// Peso padrão por caixa (kg) — usado só pra SUGERIR o peso na tela; o valor
// gravado é `pesoTotalKg`, sempre editável.
//
// 32 é o caso comum, não uma regra: nos lotes reais aparecem 25 (Cru Lã,
// Rosa Prata), 30,91 (Azul Marinho 16470) e 31,88 (Verde Musgo 80690). O
// import de CSV nunca usa esta constante quando dá pra derivar o peso da
// própria planilha — ver `src/lib/fios/importar-csv.ts`.
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

// Decimal OPCIONAL: vazio vira `null`, que quer dizer "não tem". Nunca 0 —
// zero é um valor, e num campo de dinheiro mente (R$ 0,00/kg lê como fio de
// graça, não como "não sei quanto custou").
const decimalOpcional = (mensagem: string) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) =>
      v == null || String(v).trim() === '' ? null : String(v).replace(',', '.'),
    )
    .refine(
      (v) => v === null || (!Number.isNaN(Number(v)) && Number(v) > 0),
      mensagem,
    )

// Texto opcional que vira `null` (e não `undefined`) — é o que o insert
// precisa mandar pra coluna nullable.
const textoOpcionalNull = (max: number, mensagem: string) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
    .refine((v) => v === null || v.length <= max, mensagem)

const dataOpcional = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida')

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

// O QUE É OBRIGATÓRIO: cor, caixas e peso. Mais nada.
//
// A planilha da fábrica não traz valor, vendedor, vencimento nem sempre o
// número do lote; exigir esses campos obrigava a inventar dado e foi o que
// manteve a tela sem uso. A data de entrada continua obrigatória no schema,
// mas o formulário já nasce com hoje preenchido e o import aplica a data de
// referência — ou seja, ela nunca barra ninguém na prática.
export const loteFioSchema = z.object({
  numeroLote: textoOpcionalNull(60, 'Número de lote muito longo'),
  corFornecedorId: uuidCampo,
  caixas: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, 'Informe um número de caixas válido'),
  pesoTotalKg: decimalPositivoObrigatorio('Informe o peso total do lote'),
  valorTotal: decimalOpcional('Valor total inválido'),
  vendedor: textoOpcionalNull(120, 'Nome do vendedor muito longo'),
  dataEntrada: dataSchema,
  vencimentoPagamento: dataOpcional,
  notaFiscal: textoLivreOpt,
  observacao: textoLivreOpt,
})

export type LoteFioInput = z.input<typeof loteFioSchema>
export type LoteFioOutput = z.output<typeof loteFioSchema>

// -----------------------------------------------------------------
// Saída (retirada) de fio de um lote
// -----------------------------------------------------------------

export const saidaFioSchema = z.object({
  loteId: uuidCampo,
  caixas: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' ? NaN : Number(v)))
    .refine((v) => Number.isInteger(v) && v > 0, 'Informe um número de caixas válido'),
  pesoKg: decimalPositivoObrigatorio('Informe o peso retirado'),
  data: dataSchema,
  motivo: z.string().trim().min(1, 'Informe o motivo').max(120),
  observacao: textoLivreOpt,
})

export type SaidaFioInput = z.input<typeof saidaFioSchema>
export type SaidaFioOutput = z.output<typeof saidaFioSchema>
