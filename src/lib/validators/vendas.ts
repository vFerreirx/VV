import { z } from 'zod'

// -----------------------------------------------------------------
// Catálogo de marketplaces e contas
// -----------------------------------------------------------------

export const MARKETPLACE_LABEL = {
  mercado_livre: 'Mercado Livre',
  shopee: 'Shopee',
  shein: 'Shein',
  tiktok: 'TikTok',
  temu: 'Temu',
  amazon: 'Amazon',
  vendas_atacado: 'Vendas Atacado',
} as const

export type Marketplace = keyof typeof MARKETPLACE_LABEL

// Contas reais (com a numeração que o usuário usa). `key` é estável e fica
// salva no banco; `label` é o que aparece na tela dentro do marketplace.
export const CONTAS_MARKETPLACE = [
  { key: 'ml_1', marketplace: 'mercado_livre', label: 'Conta 1' },
  { key: 'ml_3', marketplace: 'mercado_livre', label: 'Conta 3' },
  { key: 'ml_4', marketplace: 'mercado_livre', label: 'Conta 4' },
  { key: 'shopee_1', marketplace: 'shopee', label: 'Conta 1' },
  { key: 'shopee_2', marketplace: 'shopee', label: 'Conta 2' },
  { key: 'shopee_5', marketplace: 'shopee', label: 'Conta 5' },
  { key: 'shein_1', marketplace: 'shein', label: 'Conta 1' },
  { key: 'shein_5', marketplace: 'shein', label: 'Conta 5' },
  { key: 'tiktok', marketplace: 'tiktok', label: 'TikTok' },
  { key: 'temu', marketplace: 'temu', label: 'Temu' },
  { key: 'amazon', marketplace: 'amazon', label: 'Amazon' },
  { key: 'atacado_5', marketplace: 'vendas_atacado', label: 'Conta 5' },
] as const satisfies ReadonlyArray<{
  key: string
  marketplace: Marketplace
  label: string
  ativo?: boolean
}>

export type ContaKey = (typeof CONTAS_MARKETPLACE)[number]['key']

const CONTA_KEYS = CONTAS_MARKETPLACE.map((c) => c.key) as [
  ContaKey,
  ...ContaKey[],
]

export function marketplaceDaConta(key: string): Marketplace | null {
  return CONTAS_MARKETPLACE.find((c) => c.key === key)?.marketplace ?? null
}

// Marketplaces/contas ATIVOS pro registro manual (esconde contas inativas,
// como a Amazon, e marketplaces que ficaram sem nenhuma conta ativa).
export const MARKETPLACES_AGRUPADOS = (
  Object.keys(MARKETPLACE_LABEL) as Marketplace[]
)
  .map((m) => ({
    marketplace: m,
    label: MARKETPLACE_LABEL[m],
    contas: CONTAS_MARKETPLACE.filter(
      (c) => c.marketplace === m && (c as { ativo?: boolean }).ativo !== false,
    ),
  }))
  .filter((g) => g.contas.length > 0)

// -----------------------------------------------------------------
// Helpers de validação
// -----------------------------------------------------------------

// Texto livre opcional SEM limite de tamanho (coluna é `text()`). Normaliza
// vazio/null → undefined, igual aos demais campos opcionais.
const textoLivreOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? undefined : v))
  .optional()

const intNaoNeg = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' ? 0 : Number(v)))
  .refine((v) => Number.isInteger(v) && v >= 0, 'Informe um inteiro >= 0')

// Valor monetário opcional (>= 0). Guardado como string (numeric).
const valorOpt = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === '') return null
    return String(v).replace(',', '.')
  })
  .refine(
    (v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    'Valor inválido',
  )
  .optional()

// -----------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------

export const vendaContaSchema = z.object({
  conta: z.enum(CONTA_KEYS),
  quantidade: intNaoNeg,
  faturamento: valorOpt,
})

export const vendaDiaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  observacao: textoLivreOpt,
  contas: z.array(vendaContaSchema).default([]),
})

export type VendaContaInput = z.input<typeof vendaContaSchema>
export type VendaDiaInput = z.input<typeof vendaDiaSchema>
