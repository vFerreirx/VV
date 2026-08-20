import { z } from 'zod'

// Cor opcional em hex. À prova de chave ausente (Server Action descarta
// undefined → chave some no servidor; sem .optional() o Zod 4 falha).
const corOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' ? undefined : v))
  .refine(
    (v) => v === undefined || /^#[0-9a-fA-F]{6}$/.test(v),
    'Cor inválida',
  )
  .optional()

const uuidOpt = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v == null || v === '' || v === 'nenhum' ? null : v))
  .refine(
    (v) =>
      v === null ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
    'ID inválido',
  )
  .optional()

const uuidArray = z
  .union([z.array(z.string()), z.null(), z.undefined()])
  .transform((v) => v ?? [])
  .refine(
    (arr) =>
      arr.every((v) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
      ),
    'IDs inválidos',
  )
  .optional()

export const estacaoSchema = z.object({
  nome: z.string().trim().min(2, 'Nome obrigatório').max(60, 'Nome muito longo'),
  cor: corOpt,
  operadorDiaId: uuidOpt,
  operadorNoiteId: uuidOpt,
  // IDs das máquinas que pertencem a esta estação.
  maquinaIds: uuidArray,
})

export type EstacaoInput = z.input<typeof estacaoSchema>

// Paleta de cores pras estações (reaproveita a dos operadores).
export const ESTACAO_CORES = [
  '#22c55e', // verde
  '#3b82f6', // azul
  '#f97316', // laranja
  '#a855f7', // roxo
  '#ec4899', // rosa
  '#14b8a6', // teal
  '#eab308', // amarelo
  '#ef4444', // vermelho
  '#6366f1', // índigo
  '#06b6d4', // ciano
] as const
