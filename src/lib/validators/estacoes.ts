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

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const uuidArray = z
  .union([z.array(z.string()), z.null(), z.undefined()])
  .transform((v) => v ?? [])
  .refine((arr) => arr.every((v) => uuidRe.test(v)), 'IDs inválidos')
  .optional()

// Quantos operadores cabem numa estação. O limite mora AQUI e não no banco
// de propósito: é regra de negócio, não verdade do schema — virar 4 é
// trocar este número, sem migration e sem mexer em tela.
export const MAX_OPERADORES_POR_ESTACAO = 3

// Operadores da estação. Os três slots são opcionais, inclusive os dois
// primeiros: hoje não existe NENHUM operador cadastrado, e exigir gente
// deixaria a tela de estações inutilizável até alguém ser contratado. O
// terceiro é o que a tela rotula como "(opcional)".
const operadorIdsSchema = z
  .union([z.array(z.string()), z.null(), z.undefined()])
  .transform((v) => v ?? [])
  .refine((arr) => arr.every((v) => uuidRe.test(v)), 'IDs inválidos')
  .refine(
    (arr) => new Set(arr).size === arr.length,
    'O mesmo operador foi escolhido em dois slots',
  )
  .refine(
    (arr) => arr.length <= MAX_OPERADORES_POR_ESTACAO,
    `No máximo ${MAX_OPERADORES_POR_ESTACAO} operadores por estação`,
  )
  .optional()

export const estacaoSchema = z.object({
  nome: z.string().trim().min(2, 'Nome obrigatório').max(60, 'Nome muito longo'),
  cor: corOpt,
  // Até 3 operadores, SEM TURNO. Substitui operadorDiaId/operadorNoiteId,
  // que viraram legado no banco (ver src/lib/db/schema/estacoes.ts).
  operadorIds: operadorIdsSchema,
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

/**
 * Por que a estação não pode ser excluída agora, ou null se pode.
 *
 * ⚠️ OP EM PRODUÇÃO PRENDE A ESTAÇÃO. Excluir tira a estação das máquinas, e
 * a OP que está rodando numa delas some de todos os tablets — o da estação
 * deixa de existir e nenhum outro enxerga a máquina. Ninguém consegue
 * concluir, e a máquina fica ocupada sem dono.
 *
 * A MESMA FRASE na action (que recusa de verdade) e no diálogo (que desabilita
 * o botão antes): mora aqui pra as duas não divergirem.
 */
export function motivoParaNaoExcluirEstacao(
  maquinas: readonly { codigo: string; opEmProducao: string | null }[],
): string | null {
  const presas = maquinas.filter(
    (m): m is { codigo: string; opEmProducao: string } =>
      m.opEmProducao !== null,
  )
  if (presas.length === 0) return null
  if (presas.length === 1) {
    const m = presas[0]!
    return `A ${m.codigo} está com a OP ${m.opEmProducao} em produção. Conclua ou tire a OP da máquina antes de excluir a estação.`
  }
  const lista = presas.map((m) => `${m.codigo} (${m.opEmProducao})`).join(', ')
  return `Estão com OP em produção: ${lista}. Conclua ou tire as OPs das máquinas antes de excluir a estação.`
}
