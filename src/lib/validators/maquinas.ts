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

// OS STATUS QUE ALGUÉM ESCOLHE NUM FORMULÁRIO.
//
// ⚠️ 'operando' e 'parada' ficam DE FORA, e não é omissão. Este campo declara
// DISPONIBILIDADE — a máquina pode produzir? —, nunca ocupação. Escolher
// "Operando" à mão era o que fazia a aba Máquinas dizer que as 18 estavam
// produzindo com a fábrica parada. Quem diz que a máquina está produzindo é a
// OP, e o rótulo da tela é derivado (src/lib/producao/estado-maquina.ts).
//
// Os dois continuam VÁLIDOS no enum e no banco: 'operando' é o valor que as
// 18 linhas têm e o que o botão "Ativar" grava; 'parada' é histórico. O
// schema segue aceitando os cinco — isto aqui é só o que a TELA oferece.
export const STATUS_ESCOLHIVEIS = [
  'setup',
  'manutencao',
  'desativada',
] as const satisfies readonly (typeof maquinaStatusValues)[number][]

export const maquinaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(2, 'Código obrigatório')
    .max(20, 'Código muito longo')
    .regex(/^[A-Z0-9-]+$/i, 'Use apenas letras, números e hífen'),
  nome: z.string().trim().min(2, 'Nome obrigatório').max(120, 'Nome muito longo'),
  status: z.enum(maquinaStatusValues),

  // ⚠️ `operadorAtualId` SAIU DAQUI. A coluna continua no banco (histórico),
  // mas o app não escreve mais nela: quem responde "este operador manda
  // nesta máquina" é `estacao_operadores`, e a policy RLS passou a seguir a
  // estação (56_maquinas_rls_estacao.sql). Enquanto o campo era editável,
  // preencher um cadastro concedia permissão sem ninguém perceber — e em
  // produção ele apontava, em três máquinas, pra um usuário APAGADO.
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
