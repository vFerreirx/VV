import { z } from 'zod'

// Helpers (mesmo padrão de validators/produtos.ts).
// `.optional()` no fim é essencial: a Server Action do Next descarta valores
// undefined, então a chave pode chegar AUSENTE ao servidor — sem optional o
// Zod 4 falha com "expected nonoptional, received undefined".
const stringOpt = (max: number, label = 'Texto') =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? undefined : v))
    .refine((v) => v === undefined || v.length <= max, `${label} muito longo`)
    .optional()

// uuid opcional — '' / null / ausente significam nenhum operador atribuído.
const uuidOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? null : v))
  .refine(
    (v) =>
      v === null ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    'ID inválido',
  )
  .optional()

// -----------------------------------------------------------------
// Máquina
// -----------------------------------------------------------------

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
  status: z.enum(maquinaStatusValues),

  operadorAtualId: uuidOpt,

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
})

export type MaquinasFiltros = z.infer<typeof maquinasFiltrosSchema>

// -----------------------------------------------------------------
// Labels (UI)
// -----------------------------------------------------------------

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
