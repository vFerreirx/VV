import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

// VOCABULÁRIO: na tela isso se chama CLIENTE (a rota é /clientes). No banco e
// no código continua `compradores` — tabela, coluna `orcamentos.comprador_id`,
// FK, índices e a chave da área em permissoes.ts. Renomear tudo isso num
// sistema em produção só pra acompanhar o nome da tela é risco sem retorno.
// Se estranhar a diferença ao ler o código, é isso: é deliberado. Mesma
// decisão de schema/orcamentos.ts, que na tela é "pedido".
//
// Cadastro do cliente. Só `nome` é obrigatório — o cliente às vezes só manda
// o nome no WhatsApp, então o cadastro precisa aceitar isso e ser completado
// depois.
export const compradores = pgTable(
  'compradores',
  {
    id: uuid().primaryKey().defaultRandom(),
    nome: text().notNull(),
    // CPF (11 dígitos) ou CNPJ (14 posições) NORMALIZADO: sem pontuação e em
    // maiúsculas, porque o CNPJ alfanumérico pode ter letras nas 12 primeiras
    // posições. A formatação acontece só na exibição.
    documento: text(),
    telefone: text(),

    cep: text(),
    logradouro: text(),
    numero: text(),
    complemento: text(),
    bairro: text(),
    cidade: text(),
    uf: text(),

    observacao: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('compradores_nome_idx').on(table.nome),
    // Documento único entre os não-excluídos e só quando informado — não
    // impede vários compradores ainda sem documento.
    uniqueIndex('compradores_documento_uidx')
      .on(table.documento)
      .where(sql`${table.documento} IS NOT NULL AND ${table.deletedAt} IS NULL`),
  ],
)

export type Comprador = typeof compradores.$inferSelect
export type NewComprador = typeof compradores.$inferInsert
