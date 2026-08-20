import { z } from 'zod'

// Preço unitário obrigatório (>= 0), aceita vírgula. Guardado como string
// (numeric).
const preco = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(',', '.'))
  .refine((v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0, 'Preço inválido')

// Snapshot de um componente do kit no momento do orçamento. `quantidade` é
// POR KIT (igual a kit_itens.quantidade) — a via de separação multiplica
// pela quantidade do item na hora de montar a lista.
// `tamanho` é o do componente (a capa continua 45x45 num kit "Queen").
// `produtoId` serve só pra resolver o PESO do componente sem depender do
// nome em texto; quem o documento imprime continua sendo `produtoNome`.
const kitComponenteSchema = z.object({
  produtoNome: z.string(),
  cor: z.string().nullable(),
  quantidade: z.number().int().min(1),
  tamanho: z.string().nullable().optional(),
  produtoId: z.string().uuid().nullable().optional(),
})

export const orcamentoItemSchema = z.object({
  descricao: z.string().trim().min(2, 'Descrição muito curta').max(200, 'Descrição muito longa'),
  quantidade: z.coerce
    .number()
    .int('Quantidade inválida')
    .min(1, 'Mínimo 1')
    .max(999999, 'Quantidade muito alta'),
  precoUnitario: preco,
  // Nulo pra item avulso e pra orçamentos antigos (sem kit estruturado).
  kitId: z.string().uuid().nullable().optional(),
  // Produto do catálogo da linha avulsa — usado pra resolver o peso. Nulo
  // nas linhas de kit e nas antigas, que só têm texto.
  produtoId: z.string().uuid().nullable().optional(),
  tamanho: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v.trim() === '' ? null : v.trim()))
    .optional(),
  componentes: z.array(kitComponenteSchema).nullable().optional(),
})

export const orcamentoSchema = z.object({
  cliente: z.string().trim().min(2, 'Informe o cliente').max(120, 'Nome muito longo'),
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
  // FRETE DIGITADO no pedido. Opcional: a maioria dos pedidos não cota nada,
  // e exigir cotação pra informar frete travaria o caso comum. Vazio vira
  // `null` — "não informado" —, que é o que faz a linha de frete não sair no
  // documento. Ver src/lib/total-pedido.ts.
  freteValor: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).replace(',', '.')))
    .refine(
      (v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0),
      'Valor de frete inválido',
    )
    .optional(),
  itens: z.array(orcamentoItemSchema).min(1, 'Adicione ao menos um item'),
})

// O número do pedido é um identity sequencial (1, 2, 3…), mas na tela e no
// papel ele sai sempre com 4 dígitos: "Pedido nº 0030". Passar de 9999 só faz
// o número crescer — nunca corta.
export function formatarNumeroPedido(numero: number): string {
  return String(numero).padStart(4, '0')
}

export type OrcamentoInput = z.input<typeof orcamentoSchema>
export type OrcamentoItemInput = z.input<typeof orcamentoItemSchema>
