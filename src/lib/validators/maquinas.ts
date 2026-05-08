import { z } from 'zod'

// Helpers (mesmo padrão de validators/produtos.ts).
const numericOpt = z
  .string()
  .refine(
    (v) => v === '' || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    'Informe um número válido (>= 0)',
  )
  .transform((v) => (v === '' ? null : v))

const intOpt = z
  .string()
  .refine(
    (v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 0),
    'Informe um inteiro válido (>= 0)',
  )
  .transform((v) => (v === '' ? null : Number(v)))

const stringOpt = (max: number, label = 'Texto') =>
  z
    .string()
    .max(max, `${label} muito longo`)
    .optional()
    .or(z.literal('').transform(() => undefined))

// Datas vindas de <input type="date"> — aceita '' (null) ou 'YYYY-MM-DD'.
const dateOpt = z
  .string()
  .refine(
    (v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v),
    'Data inválida (use YYYY-MM-DD)',
  )
  .transform((v) => (v === '' ? null : new Date(`${v}T00:00:00.000Z`)))

// uuid opcional — '' significa nenhum operador atribuído.
const uuidOpt = z
  .string()
  .refine(
    (v) => v === '' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    'ID inválido',
  )
  .transform((v) => (v === '' ? null : v))

// -----------------------------------------------------------------
// Máquina
// -----------------------------------------------------------------

export const maquinaTipoValues = [
  'circular_pequeno',
  'circular_medio',
  'circular_grande',
] as const

export const maquinaStatusValues = [
  'operando',
  'parada',
  'manutencao',
  'setup',
  'desativada',
] as const

export const maquinaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, 'Código obrigatório')
    .max(20, 'Código muito longo')
    .regex(/^[A-Z0-9-]+$/i, 'Use apenas letras, números e hífen'),
  nome: z.string().trim().min(2, 'Nome obrigatório').max(120, 'Nome muito longo'),
  tipo: z.enum(maquinaTipoValues),
  status: z.enum(maquinaStatusValues),

  diametroPolegadas: numericOpt,
  finura: intOpt,
  numAlimentadores: intOpt,
  capacidadeKgPorHora: numericOpt,

  operadorAtualId: uuidOpt,

  ultimaManutencao: dateOpt,
  proximaManutencao: dateOpt,

  observacoes: stringOpt(500, 'Observações'),
})

export type MaquinaInput = z.input<typeof maquinaSchema>
export type MaquinaOutput = z.output<typeof maquinaSchema>

// -----------------------------------------------------------------
// Quick action: trocar status apenas
// -----------------------------------------------------------------

export const trocarStatusMaquinaSchema = z.object({
  status: z.enum(maquinaStatusValues),
  observacoes: stringOpt(300, 'Observações'),
})

export type TrocarStatusMaquinaInput = z.input<typeof trocarStatusMaquinaSchema>

// -----------------------------------------------------------------
// Filtros
// -----------------------------------------------------------------

export const maquinasFiltrosSchema = z.object({
  status: z
    .union([z.enum(maquinaStatusValues), z.literal('todos')])
    .optional(),
  tipo: z.union([z.enum(maquinaTipoValues), z.literal('todos')]).optional(),
})

export type MaquinasFiltros = z.infer<typeof maquinasFiltrosSchema>

// -----------------------------------------------------------------
// Labels (UI)
// -----------------------------------------------------------------

export const TIPO_LABEL: Record<(typeof maquinaTipoValues)[number], string> = {
  circular_pequeno: 'Circular pequeno',
  circular_medio: 'Circular médio',
  circular_grande: 'Circular grande',
}

export const STATUS_LABEL: Record<
  (typeof maquinaStatusValues)[number],
  string
> = {
  operando: 'Operando',
  parada: 'Parada',
  manutencao: 'Manutenção',
  setup: 'Setup',
  desativada: 'Desativada',
}

// Ordem visual dos grupos no grid.
export const STATUS_ORDER: (typeof maquinaStatusValues)[number][] = [
  'operando',
  'setup',
  'parada',
  'manutencao',
  'desativada',
]
