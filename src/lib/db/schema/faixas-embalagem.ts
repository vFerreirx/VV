import { sql } from 'drizzle-orm'
import { integer, numeric, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

// Faixas de embalagem: peso ATÉ -> medidas do pacote.
//
// Eles não usam caixa padrão. Embalam em pacote, e o tamanho do pacote varia
// com o volume de itens — daí a tabela ser cadastrável em vez de constante no
// código: quando mudar o jeito de embalar, remede e recadastra.
//
// A MAIOR faixa é a CAPACIDADE de um pacote. Pedido que passa disso vai em
// mais de um volume (ver `dividirEmPacotes` em src/lib/frete.ts).
//
// Peso em GRAMAS inteiras, como o resto do sistema (src/lib/peso.ts); a
// conversão pra kg acontece só na borda da API do Melhor Envio.
export const faixasEmbalagem = pgTable(
  'faixas_embalagem',
  {
    id: uuid().primaryKey().defaultRandom(),
    pesoAteGramas: integer().notNull(),
    alturaCm: numeric({ precision: 8, scale: 2 }).notNull(),
    larguraCm: numeric({ precision: 8, scale: 2 }).notNull(),
    comprimentoCm: numeric({ precision: 8, scale: 2 }).notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // Duas faixas com o mesmo teto tornariam a escolha do pacote ambígua.
    // Parcial: a faixa excluída libera o número de volta.
    uniqueIndex('faixas_embalagem_peso_uidx')
      .on(table.pesoAteGramas)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type FaixaEmbalagem = typeof faixasEmbalagem.$inferSelect
export type NewFaixaEmbalagem = typeof faixasEmbalagem.$inferInsert
