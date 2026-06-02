import { z } from 'zod'

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

// Campo numérico opcional vindo de input HTML.
// Tolerante a null/undefined porque o zodResolver no cliente já aplica
// o transform e a Server Action recebe o valor pós-transform — sem isso
// o re-parse falha com "expected string, received null".
const numericOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? null : String(v)))
  .refine(
    (v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    'Informe um número válido (>= 0)',
  )

// String opcional → undefined quando vazia. Tolera null no input.
const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine(
      (v) => v === undefined || v.length <= max,
      `${label} muito longo`,
    )

// -----------------------------------------------------------------
// Variação (inline na tela do produto)
// -----------------------------------------------------------------

export const variacaoSchema = z.object({
  // id presente quando estamos editando; ausente em variações novas.
  id: z.string().uuid().optional(),
  skuVariacao: z
    .string()
    .min(2, 'SKU da variação obrigatório')
    .max(80, 'SKU muito longo')
    .regex(
      /^[A-Z0-9_\-./]+$/i,
      'Use apenas letras, números, hífen, ponto, barra ou underline',
    ),
  cor: stringOpt(60, 'Cor'),
  modelo: stringOpt(80, 'Modelo'),
  tamanho: stringOpt(40, 'Tamanho'),
  precoAdicional: numericOpt,
})

export type VariacaoInput = z.infer<typeof variacaoSchema>

// -----------------------------------------------------------------
// Produto
// -----------------------------------------------------------------

export const produtoSchema = z.object({
  sku: z
    .string()
    .min(2, 'SKU obrigatório')
    .max(60, 'SKU muito longo')
    .regex(
      /^[A-Z0-9_\-./]+$/i,
      'Use apenas letras, números, hífen, ponto, barra ou underline',
    ),
  nome: z.string().min(2, 'Nome obrigatório').max(120, 'Nome muito longo'),
  descricao: stringOpt(500, 'Descrição'),

  // Dimensões da peça em cm (opcionais; preenchidas conforme cadastro)
  comprimentoCm: numericOpt,
  larguraCm: numericOpt,

  ativo: z.boolean().default(true),

  variacoes: z.array(variacaoSchema).default([]),
})

export type ProdutoInput = z.input<typeof produtoSchema>
export type ProdutoOutput = z.output<typeof produtoSchema>

// -----------------------------------------------------------------
// Filtros da listagem (vindos da query string)
// -----------------------------------------------------------------

export const produtosFiltrosSchema = z.object({
  q: z.string().trim().optional(),
  ativo: z
    .union([z.literal('true'), z.literal('false'), z.literal('todos')])
    .optional(),
})

export type ProdutosFiltros = z.infer<typeof produtosFiltrosSchema>
