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
// Preço de tabela por tamanho
// -----------------------------------------------------------------

// O campo vem mascarado em BRL ("1.234,56"), igual ao do builder do pedido.
// VAZIO é um valor legítimo e quer dizer "sem preço neste tamanho" — vira
// null e apaga a linha, não vira zero. Zero seria um preço, e produto de
// graça é decisão, não ausência de cadastro.
export const precoTamanhoSchema = z.object({
  tamanho: z.string().trim().min(1, 'Tamanho obrigatório').max(40),
  preco: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null || v === '') return null
      if (typeof v === 'number') return v
      const limpo = v.trim().replace(/\./g, '').replace(',', '.')
      if (limpo === '') return null
      return Number(limpo)
    })
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0),
      'Informe um preço válido (>= 0)',
    ),
})

export type PrecoTamanhoInput = z.input<typeof precoTamanhoSchema>

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

  // Uma entrada por tamanho que o produto oferece. Só chega o que a tela
  // mostrou: tamanho que saiu das variações não é mencionado aqui e o preço
  // dele fica intacto no banco (ver `salvarPrecosDoProduto`).
  precos: z.array(precoTamanhoSchema).default([]),
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
