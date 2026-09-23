/**
 * Restaura um backup de `npm run db:backup` num banco NOVO e confere.
 *
 * Uso:
 *   npm run db:restore -- --url "<URL do projeto novo>" --arquivo backups/vanvest-AAAA-MM-DD.sql
 *
 * ⚠️ NUNCA NA PRODUÇÃO. O arquivo cria tipos e tabelas, então por cima de um
 * banco que já os tem ele falharia no primeiro comando — mas a trava não
 * conta com isso. Ela compara QUEM É o destino com a DATABASE_URL do
 * .env.local e aborta se for o mesmo projeto, ANTES de conectar. A
 * comparação é pelo `ref` do projeto Supabase, não pela string nem só pelo
 * host — ver `identidadeDoBanco` (scripts/lib/sql-arquivo.ts): o pooler é o
 * mesmo host pra todo projeto da região, e a conexão direta da produção tem
 * outro host. Trocar a senha na URL não muda nada.
 *
 * Depois da trava, pede pra DIGITAR o ref (ou o host) do destino. É o
 * último momento de perceber que a URL colada era a errada.
 *
 * Executa comando por comando numa conexão só. O arquivo é uma transação
 * (BEGIN…COMMIT): no primeiro erro, ROLLBACK, e o banco de destino volta a
 * zero — nada pela metade. O erro diz o comando e a linha do arquivo.
 *
 * No fim, lê o MANIFESTO do arquivo e compara com o destino: linhas por
 * tabela, triggers, políticas e o contador de OP.
 */

import { readFileSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

import { config as loadEnv } from 'dotenv'
import postgres from 'postgres'

import {
  dividirSql,
  identidadeDoBanco,
  lerManifesto,
  mesmoBanco,
  type IdentidadeDoBanco,
} from './lib/sql-arquivo.ts'

loadEnv({ path: '.env.local', quiet: true })

const SCHEMAS = ['public', 'drizzle']

function argumento(nome: string): string | undefined {
  const args = process.argv.slice(2)
  const i = args.indexOf(`--${nome}`)
  if (i >= 0) return args[i + 1]
  const igual = args.find((a) => a.startsWith(`--${nome}=`))
  return igual?.slice(nome.length + 3)
}

function aborta(msg: string): never {
  console.error(`\n❌ ${msg}`)
  process.exit(1)
}

const descreve = (b: IdentidadeDoBanco) =>
  `${b.host}:${b.porta}${b.ref ? ` · projeto ${b.ref}` : ''} · usuário ${b.usuario}`

async function main() {
  const url = argumento('url')
  const caminho = argumento('arquivo')
  if (!url || !caminho) {
    aborta(
      'uso: npm run db:restore -- --url "<URL do projeto NOVO>" --arquivo backups/vanvest-AAAA-MM-DD.sql',
    )
  }

  // ---------------------------------------------------------------
  // TRAVA — antes de qualquer conexão. Na dúvida, fecha.
  // ---------------------------------------------------------------
  const producaoUrl = process.env.DATABASE_URL
  if (!producaoUrl) {
    aborta('DATABASE_URL não está no .env.local — sem ela não dá pra provar que o destino NÃO é a produção.')
  }
  let destino: IdentidadeDoBanco
  let producao: IdentidadeDoBanco
  try {
    destino = identidadeDoBanco(url)
  } catch (e) {
    aborta(`não consegui ler a URL de destino (${(e as Error).message}).`)
  }
  try {
    producao = identidadeDoBanco(producaoUrl)
  } catch (e) {
    aborta(`não consegui ler a DATABASE_URL do .env.local (${(e as Error).message}).`)
  }
  if (mesmoBanco(destino, producao)) {
    aborta(
      `O DESTINO É A PRODUÇÃO (${descreve(destino)}).\n` +
        '   Restaurar é pra projeto NOVO. Nada foi executado.',
    )
  }

  let texto: string
  try {
    texto = readFileSync(caminho, 'utf8')
  } catch (e) {
    aborta(`não consegui ler ${caminho} (${(e as Error).message}).`)
  }
  const comandos = dividirSql(texto)
  const manifesto = lerManifesto(texto)
  const mb = (statSync(caminho).size / 1024 / 1024).toFixed(2)

  console.log('\nRestaurar backup')
  console.log(`  arquivo : ${caminho} (${mb} MB, ${comandos.length} comandos)`)
  console.log(`  destino : ${descreve(destino)}`)
  console.log(`  produção: ${descreve(producao)}  ← diferente, ok`)
  if (!manifesto) console.log('  ⚠️ arquivo sem manifesto: a restauração roda, mas não há com o que comparar.')

  const esperado = destino.ref ?? destino.host
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const resposta = (
    await rl.question(`\nPra confirmar, digite ${destino.ref ? 'o ref do projeto' : 'o host'} de destino (${esperado}): `)
  ).trim()
  rl.close()
  if (resposta !== esperado) aborta('Confirmação não bateu. Nada foi executado.')

  // ---------------------------------------------------------------
  // Execução — uma conexão, comando por comando
  // ---------------------------------------------------------------
  // max: 1 é o que deixa o BEGIN do arquivo valer pros comandos seguintes.
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
  let secaoAtual = ''
  const t0 = Date.now()
  try {
    for (let k = 0; k < comandos.length; k++) {
      const c = comandos[k]
      if (c.secao !== secaoAtual) {
        secaoAtual = c.secao
        console.log(`  • ${secaoAtual || 'preâmbulo'} (comando ${k + 1}/${comandos.length})`)
      }
      try {
        await sql.unsafe(c.texto)
      } catch (e) {
        const err = e as Error & { detail?: string; hint?: string; position?: string }
        // A transação do arquivo já está abortada no servidor; o ROLLBACK
        // encerra e devolve o destino a zero. Falhar aqui não muda nada.
        await sql.unsafe('ROLLBACK').catch(() => {})
        const trecho = c.texto.split('\n').slice(0, 3).join('\n').slice(0, 300)
        console.error(`\n❌ Falhou o comando ${k + 1}/${comandos.length}, linha ${c.linha} do arquivo (seção ${c.secao || 'preâmbulo'}):`)
        console.error(`   ${trecho.replace(/\n/g, '\n   ')}${c.texto.length > trecho.length ? ' …' : ''}`)
        console.error(`\n   Postgres: ${err.message}`)
        if (err.detail) console.error(`   detalhe: ${err.detail}`)
        if (err.hint) console.error(`   dica: ${err.hint}`)
        console.error('\n   ROLLBACK feito: o destino voltou ao que era antes.')
        process.exitCode = 1
        return
      }
    }
    console.log(`\n✅ Restaurado em ${((Date.now() - t0) / 1000).toFixed(0)} s.`)

    // ---------------------------------------------------------------
    // Conferência contra o manifesto
    // ---------------------------------------------------------------
    if (!manifesto) return
    console.log('\nConferência (arquivo × destino):')
    let diferencas = 0
    let totalDestino = 0
    const largura = Math.max(...manifesto.tabelas.map((t) => t.tabela.length))
    for (const t of manifesto.tabelas) {
      const [r] = await sql.unsafe(`select count(*)::int as n from ${t.tabela}`)
      totalDestino += r.n
      const ok = r.n === t.linhas
      if (!ok) diferencas++
      console.log(`  ${ok ? '✅' : '❌'} ${t.tabela.padEnd(largura)} ${String(t.linhas).padStart(6)} × ${String(r.n).padStart(6)}`)
    }
    const compara = (rotulo: string, arquivo: string | number, dest: string | number) => {
      const ok = String(arquivo) === String(dest)
      if (!ok) diferencas++
      console.log(`  ${ok ? '✅' : '❌'} ${rotulo.padEnd(largura)} ${String(arquivo).padStart(6)} × ${String(dest).padStart(6)}`)
    }
    console.log()
    compara('TOTAL de linhas', manifesto.total, totalDestino)

    // Os mesmos critérios que o backup usa pra contar — ver backup-db.ts.
    const [trig] = await sql`
      select count(*)::int as n
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
        join pg_namespace pn on pn.oid = p.pronamespace
       where not t.tgisinternal
         and (n.nspname = any(${SCHEMAS})
              or (n.nspname = 'auth' and pn.nspname = any(${SCHEMAS})))`
    compara('triggers', manifesto.triggers, trig.n)
    const [pol] = await sql`select count(*)::int as n from pg_policies where schemaname = any(${SCHEMAS})`
    compara('políticas de RLS', manifesto.politicas, pol.n)
    const contador = await sql`select ano, ultimo_numero from public.op_numero_counter order by ano`
    compara(
      'op_numero_counter',
      manifesto.opNumeroCounter,
      contador.map((c) => `${c.ano}=${c.ultimo_numero}`).join(',') || '-',
    )

    if (diferencas > 0) {
      console.error(`\n❌ ${diferencas} diferença(s) entre o arquivo e o destino.`)
      process.exitCode = 1
    } else {
      console.log('\n✅ Tudo bate com o manifesto.')
    }
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error('\n❌ Restore falhou:', err.message ?? err)
  process.exit(1)
})
