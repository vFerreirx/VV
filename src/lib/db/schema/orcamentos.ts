import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { compradores } from './compradores'
import { orcamentoStatusEnum } from './enums'
import { kits } from './kits'
import { produtos } from './produtos'

// Snapshot dos componentes do kit no momento do orçamento — o orçamento é
// documento histórico, não pode mudar se a composição do kit mudar depois.
// `quantidade` é POR KIT (igual a kit_itens.quantidade), não já multiplicada
// pela quantidade do item do orçamento — a multiplicação acontece na via de
// separação.
// `tamanho` é o tamanho REAL do componente (a capa é 45x45 mesmo num kit
// "Queen"), resolvido a partir do tamanho único escolhido pro kit. Opcional
// porque orçamentos antigos não têm.
// `produtoId` é o vínculo com o catálogo, usado só pra resolver o PESO do
// componente sem depender do nome em texto. Opcional porque snapshots
// antigos não têm — e continua sendo `produtoNome` o que o documento
// imprime, justamente pra composição antiga não mudar de aparência.
export type KitComponenteSnapshot = {
  produtoNome: string
  cor: string | null
  quantidade: number
  tamanho?: string | null
  produtoId?: string | null
}

// VOCABULÁRIO: na tela isso se chama PEDIDO (a rota é /pedidos). No banco e
// no código continua `orcamentos` — renomear tabela, enum, coluna e índices
// num sistema em produção só pra acompanhar o nome da tela é risco sem
// retorno. Se estranhar a diferença ao ler o código, é isso: é deliberado.
//
// Orçamento pra cliente (ex.: atacado): cabeçalho + itens com preço
// manual (produtos não têm preço no catálogo). Número sequencial simples.
export const orcamentos = pgTable(
  'orcamentos',
  {
    id: uuid().primaryKey().defaultRandom(),
    numero: integer().generatedAlwaysAsIdentity(),
    // `cliente` continua sendo a fonte do nome impresso no documento — o
    // vínculo com o cadastro é OPCIONAL e orçamento antigo não tem nenhum.
    cliente: text().notNull(),
    compradorId: uuid().references(() => compradores.id, {
      onDelete: 'set null',
    }),
    observacao: text(),
    status: orcamentoStatusEnum().notNull().default('aguardando'),

    // FRETE ESCOLHIDO — snapshot, do lado do preço e não do peso (ver
    // AGENTS.md). Recotar depois não pode reescrever sozinho o que já foi
    // combinado com o cliente. O CEP fica junto porque o comprador pode
    // mudar de endereço, e aí o valor gravado perderia o contexto.
    freteCepDestino: text(),
    freteTransportadora: text(),
    freteServico: text(),
    freteValor: numeric({ precision: 12, scale: 2 }),
    fretePrazoDias: integer(),
    freteCotadoEm: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('orcamentos_numero_idx').on(table.numero),
    index('orcamentos_comprador_idx').on(table.compradorId),
  ],
)

export const orcamentoItens = pgTable(
  'orcamento_itens',
  {
    id: uuid().primaryKey().defaultRandom(),
    orcamentoId: uuid()
      .notNull()
      .references(() => orcamentos.id, { onDelete: 'cascade' }),
    descricao: text().notNull(),
    quantidade: integer().notNull().default(1),
    precoUnitario: numeric({ precision: 12, scale: 2 }).notNull().default('0'),
    // Kit estruturado (nulo pra produto avulso e pra orçamentos antigos).
    kitId: uuid().references(() => kits.id, { onDelete: 'set null' }),
    // Produto do catálogo da linha AVULSA. Serve pra resolver o peso sem
    // depender do texto da descrição; as linhas antigas (371 delas) não têm
    // e caem no fallback por texto de src/lib/peso.ts. ON DELETE SET NULL:
    // apagar um produto não apaga item de pedido.
    produtoId: uuid().references(() => produtos.id, { onDelete: 'set null' }),
    tamanho: text(),
    kitComponentes: jsonb().$type<KitComponenteSnapshot[]>(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    index('orcamento_itens_orcamento_idx').on(table.orcamentoId),
    index('orcamento_itens_produto_idx').on(table.produtoId),
  ],
)

export type Orcamento = typeof orcamentos.$inferSelect
export type NewOrcamento = typeof orcamentos.$inferInsert
export type OrcamentoItem = typeof orcamentoItens.$inferSelect
export type NewOrcamentoItem = typeof orcamentoItens.$inferInsert
