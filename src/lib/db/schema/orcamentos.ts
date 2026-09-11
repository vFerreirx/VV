import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { compradores } from './compradores'
import { orcamentoStatusEnum, pagamentoFormaEnum } from './enums'
import { kits } from './kits'
import { produtos } from './produtos'
import { users } from './users'

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

    // PAGAMENTO COMBINADO — snapshot, irmão do bloco de frete acima e do
    // `preco_unitario` do item: é o que foi acertado com o cliente, não a
    // política de desconto de hoje. Mudar o percentual praticado não pode
    // reescrever sozinho um pedido já salvo.
    //
    // As duas colunas são OPCIONAIS e sem default: "não informado" é a
    // ausência. Pedido antigo não afirma forma nenhuma, e desconto nulo é o
    // que faz a linha não sair no documento (ver src/lib/total-pedido.ts).
    //
    // O que se grava é o PERCENTUAL, nunca o valor em reais — esse é sempre
    // derivado da mercadoria, pelo mesmo motivo de não haver coluna de
    // total. E ele morde SÓ os produtos: frete é custo repassado.
    pagamentoForma: pagamentoFormaEnum(),
    descontoPercentual: numeric({ precision: 5, scale: 2 }),

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

// ITENS FALTANTES — o que a separação não achou e precisa ser produzido.
//
// A marcação é MANUAL. O sistema não sabe o que tem em estoque
// (`movimentacoes_estoque` está vazia), e inferir daria número errado com cara
// de certo. Quem separa percorre a via e digita o que não achou.
//
// A linha é a da VIA DE SEPARAÇÃO, não o item do pedido: o que falta é uma
// capa específica de dentro do kit, não o kit inteiro. Por isso a FK é só com
// `orcamentos` e a peça é identificada por `chave` — o trio
// produto|tamanho|cor normalizado, montado por src/lib/separacao.ts, que é
// quem explode o kit e soma as linhas iguais. Leia o bloco "A CHAVE DA LINHA"
// lá antes de mexer aqui: guardar a descrição como chave é o que este desenho
// existe pra evitar.
//
// `descricao` NÃO é chave — é snapshot do texto que estava na tela quando
// alguém marcou. Serve pra dar nome à marcação órfã (item que saiu do pedido
// depois), que sem isso seria uma quantidade sem dono.
export const orcamentoFaltantes = pgTable(
  'orcamento_faltantes',
  {
    id: uuid().primaryKey().defaultRandom(),
    orcamentoId: uuid()
      .notNull()
      .references(() => orcamentos.id, { onDelete: 'cascade' }),
    chave: text().notNull(),
    descricao: text().notNull(),
    // Sempre > 0: "não falta nada" é a AUSÊNCIA da linha, não um zero
    // guardado. Assim a existência da linha já é a resposta.
    quantidade: integer().notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    uniqueIndex('orcamento_faltantes_linha_uidx').on(
      table.orcamentoId,
      table.chave,
    ),
  ],
)


// PARCELAS do pedido — os vencimentos de boleto/cheque.
//
// Existe pra dar o que LEMBRAR. `orcamentos` guarda como se paga e quanto de
// desconto, mas não guardava data nenhuma — e sem data não há como avisar
// "confira se esse boleto caiu". O sino de notificações deriva o lembrete
// daqui, sem tabela de lembrete: some sozinho quando dão baixa.
//
// ⚠️ `vencimento` é `date`, não timestamp. É um DIA, sem hora e sem fuso —
// e este projeto já pagou por confundir os dois: o comentário de
// `estaVencida` (src/lib/validators/tarefas.ts) conta como o servidor UTC da
// Vercel fazia a tarefa vencer às 21h da véspera. Como `date`, a coluna volta
// em texto 'YYYY-MM-DD' e compara direto com `hojeEmBrasilia()`.
//
// ⚠️ A SOMA DAS PARCELAS PODE NÃO BATER COM O TOTAL, e isso não é erro: tem
// entrada, tem sinal, tem acerto. A tela MOSTRA a diferença e não bloqueia —
// travar o cadastro obrigaria a mentir num dos dois números.
export const orcamentoParcelas = pgTable(
  'orcamento_parcelas',
  {
    id: uuid().primaryKey().defaultRandom(),
    orcamentoId: uuid()
      .notNull()
      .references(() => orcamentos.id, { onDelete: 'cascade' }),
    // 1..N, a ordem de exibição. Regerar recomeça do 1 — o que é único é o
    // par (orcamentoId, numero).
    numero: smallint().notNull(),
    vencimento: date().notNull(),
    // Sempre > 0 (CHECK no banco): parcela de zero não é parcela. "Sem
    // parcelas" é a ausência das linhas, igual ao que `orcamentoFaltantes`
    // faz com a quantidade.
    valor: numeric({ precision: 12, scale: 2 }).notNull(),
    // Nº do boleto, nº e banco do cheque — texto livre, serve pra achar o
    // papel.
    observacao: text(),

    // ESTADO. Nulo = pendente. Sem coluna booleana separada de propósito:
    // dois campos pra mesma verdade saem de sincronia. O banco garante por
    // CHECK que data e autor andam juntos — igual a `tarefas`.
    recebidoEm: timestamp({ withTimezone: true }),
    recebidoPor: uuid().references(() => users.id),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    // Uma parcela por número dentro do pedido, e o índice de leitura do
    // painel: `orcamentoId` é o prefixo à esquerda.
    uniqueIndex('orcamento_parcelas_numero_uidx').on(
      table.orcamentoId,
      table.numero,
    ),
    // A consulta do SINO, e só ela: pendentes por vencimento. Parcial
    // porque o histórico de recebidas só cresce e não interessa à pergunta
    // "o que falta conferir?" — mesmo desenho de `tarefas_pendentes_idx`.
    index('orcamento_parcelas_pendentes_idx')
      .on(table.vencimento)
      .where(sql`${table.recebidoEm} IS NULL`),
  ],
)

export type Orcamento = typeof orcamentos.$inferSelect
export type NewOrcamento = typeof orcamentos.$inferInsert
export type OrcamentoItem = typeof orcamentoItens.$inferSelect
export type NewOrcamentoItem = typeof orcamentoItens.$inferInsert
export type OrcamentoFaltante = typeof orcamentoFaltantes.$inferSelect
export type NewOrcamentoFaltante = typeof orcamentoFaltantes.$inferInsert
export type OrcamentoParcela = typeof orcamentoParcelas.$inferSelect
export type NewOrcamentoParcela = typeof orcamentoParcelas.$inferInsert
