import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido no ambiente')
}

// Cache do pool em globalThis pra sobreviver ao HMR do Next em dev.
const globalForPg = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>
}

// Num objeto à parte, e não literal na chamada: `max_pipeline` existe no
// runtime do postgres.js (src/index.js, junto de `idle_timeout`), mas não nos
// tipos dele — literal na chamada, o TypeScript recusa a propriedade.
const opcoes = {
  // ⚠️ POOL PEQUENO DE PROPÓSITO: 3 CONEXÕES POR INSTÂNCIA. O app conecta pelo
  // pooler do Supabase em MODO SESSÃO (porta 5432), e o modo sessão aceita no
  // máximo Pool Size clientes no projeto inteiro ("EMAXCONNSESSION ...
  // pool_size"). Cada instância do Vercel abre o próprio pool: em 17/09/2026,
  // com Pool Size 15 e 10 por instância, duas instâncias esgotavam as vagas e
  // toda página caía. Hoje o Pool Size é 30: com 3 por instância, cabem 10
  // instâncias. Página com muita consulta espera um pouco na fila do próprio
  // postgres.js, e não derruba o sistema.
  //
  // ⚠️ DUAS COISAS DESTA CONTA MORAM EM PAINEL, NÃO NO CÓDIGO:
  //   - Supabase → Project Settings → Database → Connection pooling → Pool
  //     Size. Precisa comportar `max` × instâncias do Vercel. Subiu `max`
  //     aqui? Suba o Pool Size lá antes.
  //   - Vercel → Settings → Functions → região. Precisa continuar gru1 (São
  //     Paulo), a mesma do banco (sa-east-1). Em iad1 cada consulta cruza o
  //     continente, e a conexão fica presa esse tempo a mais. Sem
  //     `vercel.json` nem `preferredRegion`: a região fica no painel.
  //
  // ⚠️ POR QUE MODO SESSÃO, e não o modo transação (6543): com `prepare:
  // false` o postgres.js manda toda consulta com parâmetro em DUAS idas (pede
  // os tipos, depois executa). O modo transação pode entregar a conexão do
  // banco a outra requisição ENTRE as duas idas, e a consulta fica presa pra
  // sempre (`ClientRead` em pg_stat_activity). Em 17/09/2026 isso travou o
  // dashboard e a página do pedido, e as conexões presas derrubaram o sistema
  // inteiro. A mesma versão, no modo sessão, funcionou.
  max: 3,
  // Devolve a vaga ao pooler logo que a instância fica ociosa.
  idle_timeout: 10,
  prepare: false,
  // ⚠️ PIPELINING NO MÍNIMO (1), e não o padrão de 100. Com as conexões do
  // pool ocupadas, o postgres.js empilha consultas na MESMA conexão sem esperar a
  // anterior terminar. Pelo pooler do Supabase em modo transação (porta 6543)
  // isso travava: a consulta ficava pela metade, o banco esperava o resto pra
  // sempre (`ClientRead` em pg_stat_activity), a página nunca terminava e a
  // conexão ficava presa — e as próximas páginas da mesma instância travavam
  // atrás dela. Apareceu em 17/09/2026, quando a página do pedido passou a
  // fazer ~18 consultas em paralelo: dashboard e pedido presos no esqueleto.
  //
  // ⚠️ NÃO É 0. Com 0 o postgres.js RECUSA TRANSAÇÃO ("UNSAFE_TRANSACTION:
  // Only use sql.begin, sql.reserved or max: 1") — toda action com
  // `db.transaction` quebrou (editar pedido, criar OP, baixa…). Com 1 cada
  // conexão leva no máximo uma consulta de fila atrás da que está rodando, e
  // a transação funciona.
  max_pipeline: 1,
}

const client =
  globalForPg.pgClient ?? postgres(process.env.DATABASE_URL, opcoes)

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgClient = client
}

export const db = drizzle(client, { schema, casing: 'snake_case' })

export type Database = typeof db
export { schema }
