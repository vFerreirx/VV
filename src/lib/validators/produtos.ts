import { z } from 'zod'

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

// Campo numérico opcional vindo de input HTML (string).
// Aceita '' como "não informado" → null. Valida que é número >= 0.
const numericOpt = z
  .string()
  .refine(
    (v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    'Informe um número válido (>= 0)',
  )
  .transform((v) => (v === '' ? null : v))

// Campo numérico obrigatório (string vinda do form).
const numericReq = z
  .string()
  .min(1, 'Obrigatório')
  .refine(
    (v) => !Number.isNaN(Number(v)) && Number(v) >= 0,
    'Informe um número válido (>= 0)',
  )

// String opcional → undefined quando vazia.
const stringOpt = (max: number, label = 'Texto') =>
  z
    .string()
    .max(max, `${label} muito longo`)
    .optional()
    .or(z.literal('').transform(() => undefined))

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
  tamanho: stringOpt(30, 'Tamanho'),
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
  categoria: stringOpt(80, 'Categoria'),
  composicao: stringOpt(160, 'Composição'),

  // Características técnicas (todas opcionais; preenchidas conforme cadastro)
  gramatura: numericOpt,
  larguraCm: numericOpt,
  rendimentoKgPorMetro: numericOpt,

  // Custos / preços
  custoProducao: numericOpt,
  precoMl: numericOpt,
  precoShopee: numericOpt,

  // Estoque mínimo (alerta visual em dashboard / listagens futuras)
  estoqueMinimoFullMl: numericReq,
  estoqueMinimoFullShopee: numericReq,

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
  categoria: z.string().trim().optional(),
  ativo: z
    .union([z.literal('true'), z.literal('false'), z.literal('todos')])
    .optional(),
})

export type ProdutosFiltros = z.infer<typeof produtosFiltrosSchema>
