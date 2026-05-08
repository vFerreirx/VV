import { z } from 'zod'

// Helpers (mesmo padrão dos outros validators)
const numericReq = z
  .string()
  .min(1, 'Obrigatório')
  .refine(
    (v) => !Number.isNaN(Number(v)) && Number(v) > 0,
    'Informe um número > 0',
  )

const dateOpt = z
  .string()
  .refine(
    (v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Data inválida (use YYYY-MM-DD)',
  )
  .transform((v) => (v === '' ? null : new Date(`${v}T00:00:00.000Z`)))

const uuidOpt = z
  .string()
  .refine(
    (v) =>
      v === '' ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    'ID inválido',
  )
  .transform((v) => (v === '' ? null : v))

const stringOpt = (max: number, label = 'Texto') =>
  z
    .string()
    .max(max, `${label} muito longo`)
    .optional()
    .or(z.literal('').transform(() => undefined))

// -----------------------------------------------------------------
// Enums (espelham os enums do banco)
// -----------------------------------------------------------------

export const canalValues = [
  'full_ml',
  'full_shopee',
  'venda_direta',
  'estoque',
] as const

export const prioridadeValues = ['baixa', 'normal', 'alta', 'urgente'] as const

export const statusValues = [
  'aguardando_materia_prima',
  'programado',
  'em_producao',
  'acabamento',
  'embalagem',
  'pronto_envio',
  'enviado',
  'cancelado',
] as const

// -----------------------------------------------------------------
// OP — criar/editar
// -----------------------------------------------------------------

export const ordemSchema = z.object({
  produtoId: z
    .string()
    .min(1, 'Selecione um produto')
    .refine(
      (v) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          v,
        ),
      'Produto inválido',
    ),
  variacaoId: uuidOpt,

  quantidadeKg: numericReq,

  maquinaId: uuidOpt,

  canalDestino: z.enum(canalValues),
  prioridade: z.enum(prioridadeValues),
  status: z.enum(statusValues),

  dataPrevistaInicio: dateOpt,
  dataPrevistaFim: dateOpt,

  responsavelId: uuidOpt,
  observacoes: stringOpt(500, 'Observações'),
})

export type OrdemInput = z.input<typeof ordemSchema>
export type OrdemOutput = z.output<typeof ordemSchema>

// -----------------------------------------------------------------
// Mudar status (usado pelo kanban)
// -----------------------------------------------------------------

export const mudarStatusOrdemSchema = z.object({
  status: z.enum(statusValues),
  observacao: stringOpt(300, 'Observação'),
})

export type MudarStatusOrdemInput = z.input<typeof mudarStatusOrdemSchema>

// -----------------------------------------------------------------
// Filtros
// -----------------------------------------------------------------

export const ordensFiltrosSchema = z.object({
  q: z.string().trim().optional(),
  status: z.union([z.enum(statusValues), z.literal('todos')]).optional(),
  canal: z.union([z.enum(canalValues), z.literal('todos')]).optional(),
  prioridade: z
    .union([z.enum(prioridadeValues), z.literal('todas')])
    .optional(),
  maquinaId: z.string().trim().optional(),
})

export type OrdensFiltros = z.infer<typeof ordensFiltrosSchema>

// -----------------------------------------------------------------
// Labels
// -----------------------------------------------------------------

export const CANAL_LABEL: Record<(typeof canalValues)[number], string> = {
  full_ml: 'Full Mercado Livre',
  full_shopee: 'Full Shopee',
  venda_direta: 'Venda direta',
  estoque: 'Estoque',
}

export const CANAL_LABEL_CURTO: Record<(typeof canalValues)[number], string> = {
  full_ml: 'Full ML',
  full_shopee: 'Full Shopee',
  venda_direta: 'Direta',
  estoque: 'Estoque',
}

export const PRIORIDADE_LABEL: Record<
  (typeof prioridadeValues)[number],
  string
> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const STATUS_LABEL: Record<(typeof statusValues)[number], string> = {
  aguardando_materia_prima: 'Aguardando matéria-prima',
  programado: 'Programado',
  em_producao: 'Em produção',
  acabamento: 'Acabamento',
  embalagem: 'Embalagem',
  pronto_envio: 'Pronto pra envio',
  enviado: 'Enviado',
  cancelado: 'Cancelado',
}

export const STATUS_LABEL_CURTO: Record<
  (typeof statusValues)[number],
  string
> = {
  aguardando_materia_prima: 'Aguardando MP',
  programado: 'Programado',
  em_producao: 'Em produção',
  acabamento: 'Acabamento',
  embalagem: 'Embalagem',
  pronto_envio: 'Pronto envio',
  enviado: 'Enviado',
  cancelado: 'Cancelado',
}

// Ordem do fluxo do kanban (cancelado fica de fora)
export const STATUS_KANBAN: (typeof statusValues)[number][] = [
  'aguardando_materia_prima',
  'programado',
  'em_producao',
  'acabamento',
  'embalagem',
  'pronto_envio',
  'enviado',
]
