import { z } from 'zod'

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

// String opcional → undefined quando vazia. Tolera null e chave ausente.
const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine(
      (v) => v === undefined || v.length <= max,
      `${label} muito longo`,
    )
    .optional()

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

  // OVERRIDE opcional do peso do tamanho, em gramas inteiras. O normal é
  // vazio — só se preenche quando este modelo destoa dos outros que dividem
  // o mesmo tamanho.
  pesoGramas: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v >= 0),
      'Informe um número inteiro de gramas (>= 0)',
    )
    .optional(),

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
