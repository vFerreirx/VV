import { z } from 'zod'

// Tarefa da administração. Só o título é obrigatório — o caminho rápido de
// criação é digitar o título e salvar; prazo e conta são secundários e a
// maioria das tarefas nasce sem eles.
export const tarefaSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(2, 'Título muito curto')
    .max(160, 'Título muito longo'),

  descricao: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : v.trim()))
    .refine((v) => v === null || v.length <= 2000, 'Descrição muito longa')
    .transform((v) => (v === '' ? null : v)),

  prazo: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === '' ? null : v))
    .refine(
      (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'Data inválida',
    ),

  contaId: z
    .union([z.uuid('Conta inválida'), z.null(), z.undefined()])
    .transform((v) => v ?? null),
})

export type TarefaInput = z.input<typeof tarefaSchema>
export type TarefaData = z.output<typeof tarefaSchema>

// Vencida = prazo anterior a hoje. Comparação em texto YYYY-MM-DD de
// propósito: `prazo` é `date` (sem hora nem fuso) e virar Date aqui traria
// o fuso do servidor junto, fazendo a tarefa vencer cedo ou tarde demais.
export function hojeISO(): string {
  const agora = new Date()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mes}-${dia}`
}

export function estaVencida(prazo: string | null): boolean {
  return prazo !== null && prazo < hojeISO()
}
