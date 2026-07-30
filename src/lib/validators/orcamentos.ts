import { z } from 'zod'

// Preço unitário obrigatório (>= 0), aceita vírgula. Guardado como string
// (numeric).
const preco = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.'))
  .refine(
    (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0,
    'Preço inválido',
  )

// Snapshot de um componente do kit no momento do orçamento. `quantidade` é
// POR KIT (igual a kit_itens.quantidade) — a via de separação multiplica
// pela quantidade do item na hora de montar a lista.
// `tamanho` é o do componente (a capa continua 45x45 num kit "Queen").
const kitComponenteSchema = z.object({
  produtoNome: z.string(),
  cor: z.string().nullable(),
  quantidade: z.number().int().min(1),
  tamanho: z.string().nullable().optional(),
})

export const orcamentoItemSchema = z.object({
  descricao: z
    .string()
    .trim()
    .min(2, 'Descrição muito curta')
    .max(200, 'Descrição muito longa'),
  quantidade: z.coerce
    .number()
    .int('Quantidade inválida')
    .min(1, 'Mínimo 1')
    .max(999999, 'Quantidade muito alta'),
  precoUnitario: preco,
  // Nulo pra item avulso e pra orçamentos antigos (sem kit estruturado).
  kitId: z.string().uuid().nullable().optional(),
  tamanho: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
    .optional(),
  componentes: z.array(kitComponenteSchema).nullable().optional(),
})

export const orcamentoSchema = z.object({
  cliente: z
    .string()
    .trim()
    .min(2, 'Informe o cliente')
    .max(120, 'Nome muito longo'),
  // Vínculo OPCIONAL com o cadastro de compradores. `cliente` (texto acima)
  // continua sendo a fonte do nome impresso — orçamento sem comprador
  // cadastrado funciona igual a antes.
  compradorId: z
    .union([z.string().uuid(), z.null(), z.undefined()])
    .transform((v) => v ?? null)
    .optional(),
  observacao: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v.trim() === '' ? undefined : v.trim()))
    .optional(),
  itens: z.array(orcamentoItemSchema).min(1, 'Adicione ao menos um item'),
})

export type OrcamentoInput = z.input<typeof orcamentoSchema>
export type OrcamentoItemInput = z.input<typeof orcamentoItemSchema>
