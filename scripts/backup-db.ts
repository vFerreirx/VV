/**
 * Backup do banco: schema + dados num .sql só, com a data no nome.
 *
 * Uso: npm run db:backup
 *
 * O plano Free do Supabase NÃO faz backup automático. Isto é o backup.
 *
 * Por que um script, e não `supabase db dump`: o CLI roda o `pg_dump` dentro
 * do Docker, e a máquina da casa não tem Docker nem Postgres instalado
 * (testado em 23/09/2026: "LegacyDockerRunError: failed to run docker").
 * Aqui é Node puro, com a mesma DATABASE_URL do app.
 *
 * Saída: backups/vanvest-AAAA-MM-DD.sql (data de Brasília). Se o .env.local
 * tiver BACKUP_DRIVE_DIR, uma cópia vai pra lá também — a pasta do Google
 * Drive for Desktop, pra o backup sair desta máquina.
 *
 * ⚠️ O ARQUIVO TEM DADO SENSÍVEL: cliente, preço de atacado e o HASH DA
 * SENHA de todo usuário (auth.users — sem ele, `public.users` não volta, a FK
 * aponta pra lá). `backups/` está no .gitignore e NUNCA pode virar commit; a
 * pasta do Drive não pode ser compartilhada.
 *
 * O arquivo sai na ordem do pg_dump, e a ordem é o que o faz funcionar:
 *   tipos → sequências → funções → tabelas → DADOS → PK/UNIQUE/CHECK
 *   → índices → FKs → triggers → RLS/políticas → grants → realtime
 * Cada seção abaixo diz de quem ela depende. Antes de reordenar qualquer
 * coisa, leia o porquê — a de tipos já quebrou uma vez (23/09/2026).
 * ⚠️ TRIGGER DEPOIS DOS DADOS NÃO É ESTÉTICA. Com o `generate_op_numero`
 * ligado na hora do INSERT, a restauração RENUMERARIA todas as OPs; com o
 * `on_auth_user_created`, cada usuário restaurado tentaria recriar a própria
 * linha em `public.users`. E FK depois dos dados dispensa ordenar as tabelas.
 *
 * Tudo é lido numa transação REPEATABLE READ READ ONLY: um retrato só do
 * banco, mesmo que alguém salve um pedido no meio do backup.
 *
 * O backup ESCREVE UMA LINHA no banco, de propósito, e só uma: no fim, em
 * `backups_registro` (supabase/sql/71). É assim que o sistema descobre se o
 * backup parou — ele roda na Vercel, não enxerga esta máquina nem o Drive, só
 * o banco; sem a linha, o backup para em silêncio e ninguém sabe até precisar
 * de um. O INSERT fica FORA do retrato, numa instrução à parte, DEPOIS da
 * cópia pro Drive (pra `copia_drive` dizer se ela chegou de verdade). Por
 * isso a linha deste backup não está dentro do próprio arquivo — está no
 * próximo. Se o INSERT falhar, o backup NÃO está perdido: o arquivo já
 * existe. Avisa e segue.
 */

import { copyFileSync, createWriteStream, mkdirSync, statSync } from 'node:fs'
import { hostname } from 'node:os'
import { basename, join } from 'node:path'

import { config as loadEnv } from 'dotenv'
import postgres from 'postgres'

import { hojeEmBrasilia } from '../src/lib/dia-brasil.ts'

loadEnv({ path: '.env.local', quiet: true })

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não definido em .env.local')
  process.exit(1)
}

// Os schemas que são NOSSOS. `drizzle` guarda o histórico de migrations —
// sem ele, o primeiro `db:setup` depois de restaurar tentaria recriar tudo.
const SCHEMAS = ['public', 'drizzle']

// De `auth` só os DADOS: o schema é do Supabase e já existe em todo projeto
// novo. Ordem importa aqui, porque as FKs de `auth` já estão lá na restauração.
const TABELAS_AUTH = ['users', 'identities']

// Os papéis do Supabase cujo acesso a gente reproduz. Um projeto novo concede
// TUDO a eles em toda tabela nova — sem o REVOKE, restaurar reabriria o
// contador de OP que a migration 70 fechou.
const PAPEIS_API = ['anon', 'authenticated', 'service_role']

const LOTE = 500

const q = (nome: string) => `"${nome.replace(/"/g, '""')}"`
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

async function main() {
  const dia = hojeEmBrasilia()
  const pasta = join(process.cwd(), 'backups')
  mkdirSync(pasta, { recursive: true })
  const arquivo = join(pasta, `vanvest-${dia}.sql`)
  const out = createWriteStream(arquivo, { encoding: 'utf8' })
  const w = (s = '') => {
    out.write(s + '\n')
  }

  const sql = postgres(DATABASE_URL!, { max: 1, prepare: false })
  const linhasPorTabela: { tabela: string; linhas: number }[] = []

  try {
    await sql.begin('isolation level repeatable read read only', async (tx) => {
      // Nome de tipo e expressão saem QUALIFICADOS (public.user_role), e
      // datas com fuso explícito: o arquivo não depende de quem restaura.
      await tx.unsafe(`set local search_path = ''`)
      await tx.unsafe(`set local timezone = 'UTC'`)
      await tx.unsafe(`set local extra_float_digits = 3`)

      // ---------------------------------------------------------------
      // Guarda: se aparecer um tipo de objeto que este script não exporta,
      // PARA. Backup que pula coisa em silêncio é pior que nenhum.
      // ---------------------------------------------------------------
      const naoSuportado = await tx`
        select n.nspname || '.' || c.relname as nome, c.relkind::text as relkind
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = any(${SCHEMAS}) and c.relkind in ('v','m','f','p')
        union all
        select n.nspname || '.' || t.typname, t.typtype::text
          from pg_type t join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = any(${SCHEMAS}) and t.typtype in ('d','c','r')
           and not exists (select 1 from pg_class c where c.reltype = t.oid)`
      if (naoSuportado.length > 0) {
        throw new Error(
          `o backup não sabe exportar: ${naoSuportado.map((r) => `${r.nome} (${r.relkind})`).join(', ')}`,
        )
      }

      w(`-- Backup Vanvest — ${dia}`)
      w(`-- Gerado por scripts/backup-db.ts. Restaurar num projeto Supabase NOVO:`)
      w(`--   psql "<URL do projeto novo>" -v ON_ERROR_STOP=1 -f vanvest-${dia}.sql`)
      w(`-- ⚠️ Contém dado de cliente, preço e hash de senha. Não compartilhe.`)
      w()
      w(`SET statement_timeout = 0;`)
      w(`SET client_encoding = 'UTF8';`)
      w(`SET standard_conforming_strings = on;`)
      // Função SQL valida o corpo ao ser criada, e o corpo cita tabelas que
      // ainda não existem nesse ponto do arquivo. O pg_dump faz igual.
      w(`SET check_function_bodies = false;`)
      w(`SET search_path = '';`)
      w()
      // Tudo ou nada: restauração que para no meio não deixa banco pela metade.
      w(`BEGIN;`)
      w()
      for (const s of SCHEMAS) w(`CREATE SCHEMA IF NOT EXISTS ${q(s)};`)
      w()

      // ---------------------------------------------------------------
      // Enums — ANTES DAS FUNÇÕES, e não é gosto.
      //
      // ⚠️ Função com tipo próprio na ASSINATURA não compila antes do tipo
      // existir: `public.user_role()` é `RETURNS public.user_role`. O
      // `check_function_bodies = false` lá de cima só poupa o CORPO, nunca a
      // assinatura. Testado em 23/09/2026: com as funções no topo, a
      // restauração num projeto novo falhava em "type public.user_role does
      // not exist". O pg_dump emite tipo antes de função por esse motivo
      // exato. Agrupar as funções no topo "porque fica mais bonito" quebra a
      // restauração de novo.
      // ---------------------------------------------------------------
      w(`-- ========== TIPOS ==========`)
      const enums = await tx`
        select format('%I.%I', n.nspname, t.typname) as nome,
               array_agg(e.enumlabel order by e.enumsortorder) as valores
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = any(${SCHEMAS})
         group by n.nspname, t.typname
         order by 1`
      for (const e of enums) {
        w(`CREATE TYPE ${e.nome} AS ENUM (${(e.valores as string[]).map(lit).join(', ')});`)
      }
      w()

      // ---------------------------------------------------------------
      // Sequências soltas (as de IDENTITY nascem com a própria coluna).
      // Antes das TABELAS: o default `nextval('drizzle.…_seq'::regclass)`
      // resolve o nome da sequência na hora do CREATE TABLE. E antes das
      // funções junto com os tipos, que é onde o pg_dump as põe — nenhuma
      // depende de função.
      // ---------------------------------------------------------------
      w(`-- ========== SEQUÊNCIAS ==========`)
      const sequencias = await tx`
        select format('%I.%I', s.schemaname, s.sequencename) as nome,
               s.start_value, s.increment_by, s.min_value, s.max_value,
               s.cycle, s.last_value
          from pg_sequences s
         where s.schemaname = any(${SCHEMAS})
           and not exists (
             select 1 from pg_depend d
              where d.objid = format('%I.%I', s.schemaname, s.sequencename)::regclass
                and d.deptype = 'i')
         order by 1`
      for (const s of sequencias) {
        w(
          `CREATE SEQUENCE ${s.nome} START ${s.start_value} INCREMENT ${s.increment_by} ` +
            `MINVALUE ${s.min_value} MAXVALUE ${s.max_value}${s.cycle ? ' CYCLE' : ''};`,
        )
      }
      w()

      // ---------------------------------------------------------------
      // Funções — DEPOIS dos tipos (ver acima) e ANTES de tudo que as chama:
      // default de coluna, política de RLS (`is_manager()`, `user_role()`,
      // `pode_registrar_parada()`) e trigger.
      // ---------------------------------------------------------------
      w(`-- ========== FUNÇÕES ==========`)
      const funcoes = await tx`
        select pg_get_functiondef(p.oid) as def
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = any(${SCHEMAS}) and p.prokind in ('f','p')
           and not exists (
             select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
         order by n.nspname, p.proname`
      for (const f of funcoes) w(`${f.def};\n`)

      // ---------------------------------------------------------------
      // Tabelas (só colunas; constraint vem depois dos dados)
      // ---------------------------------------------------------------
      w(`-- ========== TABELAS ==========`)
      const tabelas = await tx`
        select c.oid, n.nspname as schema, c.relname as tabela,
               format('%I.%I', n.nspname, c.relname) as nome,
               c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
               obj_description(c.oid, 'pg_class') as comentario
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = any(${SCHEMAS}) and c.relkind = 'r'
         order by n.nspname, c.relname`

      type Coluna = {
        nome: string
        tipo: string
        notnull: boolean
        padrao: string | null
        identity: string
        gerada: string
        expr: string | null
        comentario: string | null
      }
      const colunasDe = async (oid: number): Promise<Coluna[]> =>
        (await tx`
          select a.attname as nome,
                 format_type(a.atttypid, a.atttypmod) as tipo,
                 a.attnotnull as notnull,
                 case when a.attgenerated = '' then pg_get_expr(d.adbin, d.adrelid) end as padrao,
                 a.attidentity as identity,
                 a.attgenerated as gerada,
                 case when a.attgenerated <> '' then pg_get_expr(d.adbin, d.adrelid) end as expr,
                 col_description(a.attrelid, a.attnum) as comentario
            from pg_attribute a
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where a.attrelid = ${oid} and a.attnum > 0 and not a.attisdropped
           order by a.attnum`) as unknown as Coluna[]

      const colunasPorTabela = new Map<string, Coluna[]>()
      for (const t of tabelas) {
        const cols = await colunasDe(t.oid)
        colunasPorTabela.set(t.nome, cols)
        const defs = cols.map((c) => {
          let d = `  ${q(c.nome)} ${c.tipo}`
          if (c.identity === 'a') d += ' GENERATED ALWAYS AS IDENTITY'
          if (c.identity === 'd') d += ' GENERATED BY DEFAULT AS IDENTITY'
          if (c.gerada === 's') d += ` GENERATED ALWAYS AS (${c.expr}) STORED`
          if (c.padrao) d += ` DEFAULT ${c.padrao}`
          if (c.notnull) d += ' NOT NULL'
          return d
        })
        w(`CREATE TABLE ${t.nome} (\n${defs.join(',\n')}\n);`)
        if (t.comentario) w(`COMMENT ON TABLE ${t.nome} IS ${lit(t.comentario)};`)
        for (const c of cols) {
          if (c.comentario) {
            w(`COMMENT ON COLUMN ${t.nome}.${q(c.nome)} IS ${lit(c.comentario)};`)
          }
        }
        w()
      }

      // Sequência solta que pertence a uma coluna (serial) volta a pertencer.
      const donos = await tx`
        select format('%I.%I', sn.nspname, s.relname) as seq,
               format('%I.%I', tn.nspname, t.relname) as tabela, a.attname as coluna
          from pg_depend d
          join pg_class s on s.oid = d.objid and s.relkind = 'S'
          join pg_namespace sn on sn.oid = s.relnamespace
          join pg_class t on t.oid = d.refobjid
          join pg_namespace tn on tn.oid = t.relnamespace
          join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
         where d.deptype = 'a' and sn.nspname = any(${SCHEMAS})`
      for (const d of donos) w(`ALTER SEQUENCE ${d.seq} OWNED BY ${d.tabela}.${q(d.coluna)};`)
      w()

      // ---------------------------------------------------------------
      // DADOS
      //
      // O valor sai formatado PELO PRÓPRIO POSTGRES (`quote_nullable` sobre o
      // texto da coluna), não montado em JS: enum, array, json, numeric e
      // timestamptz voltam exatamente como saíram, sem o Node reinterpretar.
      // ---------------------------------------------------------------
      w(`-- ========== DADOS ==========`)
      const despejar = async (
        nome: string,
        cols: Coluna[],
        extra: { conflito?: string } = {},
      ) => {
        // Coluna GERADA não se insere: o banco calcula de novo.
        const inseriveis = cols.filter((c) => c.gerada === '')
        const lista = inseriveis.map((c) => q(c.nome)).join(', ')
        const tupla = inseriveis.map((c) => `quote_nullable(${q(c.nome)})`).join(`, `)
        // IDENTITY ALWAYS (orcamentos.numero) recusa valor explícito sem isto
        // — e o número do pedido tem que voltar o MESMO.
        const override = cols.some((c) => c.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : ''
        let total = 0
        let lote: string[] = []
        const fecha = () => {
          if (lote.length === 0) return
          w(`INSERT INTO ${nome} (${lista})${override} VALUES\n${lote.join(',\n')}${extra.conflito ?? ''};`)
          lote = []
        }
        const cursor = tx
          .unsafe(`select '(' || concat_ws(', ', ${tupla}) || ')' as t from ${nome} order by 1`)
          .cursor(LOTE)
        for await (const linhas of cursor) {
          for (const l of linhas) {
            lote.push(l.t as string)
            total++
            if (lote.length >= LOTE) fecha()
          }
        }
        fecha()
        linhasPorTabela.push({ tabela: nome, linhas: total })
      }

      // auth primeiro só por clareza; as FKs NOSSAS entram depois de tudo.
      for (const t of TABELAS_AUTH) {
        const [rel] = await tx`
          select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'auth' and c.relname = ${t}`
        if (!rel) throw new Error(`auth.${t} não existe`)
        w(`-- auth.${t}`)
        // DO NOTHING: restaurando no MESMO projeto (perdeu só o public), o
        // usuário ainda existe em auth e não pode derrubar a restauração.
        await despejar(`auth.${q(t)}`, await colunasDe(rel.oid), {
          conflito: ' ON CONFLICT DO NOTHING',
        })
        w()
      }
      for (const t of tabelas) {
        w(`-- ${t.nome}`)
        await despejar(t.nome, colunasPorTabela.get(t.nome)!)
        w()
      }

      // Sequências continuam de onde pararam: sem isto, o próximo pedido
      // nasceria com um número que já existe.
      for (const s of sequencias) {
        if (s.last_value !== null) w(`SELECT pg_catalog.setval(${lit(s.nome)}, ${s.last_value}, true);`)
      }
      const identidades = await tx`
        select format('%I.%I', n.nspname, c.relname) as tabela, a.attname as coluna,
               pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) as seq
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = any(${SCHEMAS}) and a.attidentity <> '' and not a.attisdropped`
      for (const i of identidades) {
        const [v] = await tx.unsafe(`select last_value, is_called from ${i.seq}`)
        w(
          `SELECT pg_catalog.setval(pg_get_serial_sequence(${lit(i.tabela)}, ${lit(i.coluna)}), ` +
            `${v.last_value}, ${v.is_called});`,
        )
      }
      w()

      // ---------------------------------------------------------------
      // Constraints e índices, na ordem do pg_dump:
      //   PK/UNIQUE/CHECK/EXCLUDE → ÍNDICES → FK
      // A FK vai por ÚLTIMO porque precisa de um índice único do outro lado —
      // e esse índice pode ser de constraint (criado aqui) OU um CREATE UNIQUE
      // INDEX solto (criado na seção de índices). Com FK antes dos índices, o
      // segundo caso quebra a restauração. Em 23/09/2026 nenhuma FK dependia
      // de índice solto; a ordem é pra continuar funcionando quando depender.
      // ---------------------------------------------------------------
      const constraints = await tx`
        select format('%I.%I', n.nspname, c.relname) as tabela, k.conname,
               pg_get_constraintdef(k.oid) as def, k.contype
          from pg_constraint k
          join pg_class c on c.oid = k.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = any(${SCHEMAS}) and k.contype in ('p','u','c','x','f')
         order by n.nspname, c.relname, k.conname`
      const addConstraint = (k: (typeof constraints)[number]) =>
        w(`ALTER TABLE ${k.tabela} ADD CONSTRAINT ${q(k.conname)} ${k.def};`)

      w(`-- ========== CONSTRAINTS ==========`)
      for (const k of constraints) if (k.contype !== 'f') addConstraint(k)
      w()

      // Índices que não nasceram de PK/UNIQUE/EXCLUDE. ⚠️ Filtrar por
      // `conindid` de QUALQUER constraint estaria errado: o `conindid` de uma
      // FK aponta pro índice da tabela REFERENCIADA — um índice único solto
      // que sustenta uma FK sumiria do backup.
      w(`-- ========== ÍNDICES ==========`)
      const indices = await tx`
        select pg_get_indexdef(i.indexrelid) as def
          from pg_index i
          join pg_class c on c.oid = i.indrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = any(${SCHEMAS})
           and not exists (
             select 1 from pg_constraint k
              where k.conindid = i.indexrelid and k.contype in ('p','u','x'))
         order by 1`
      for (const i of indices) w(`${i.def};`)
      w()

      w(`-- ========== CHAVES ESTRANGEIRAS ==========`)
      for (const k of constraints) if (k.contype === 'f') addConstraint(k)
      w()

      // ---------------------------------------------------------------
      // Triggers — DEPOIS dos dados (ver o topo). Inclui os que moram em
      // auth.users mas chamam função nossa.
      // ---------------------------------------------------------------
      w(`-- ========== TRIGGERS ==========`)
      const triggers = await tx`
        select t.tgname, format('%I.%I', n.nspname, c.relname) as tabela,
               pg_get_triggerdef(t.oid) as def
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_proc p on p.oid = t.tgfoid
          join pg_namespace pn on pn.oid = p.pronamespace
         where not t.tgisinternal
           and (n.nspname = any(${SCHEMAS})
                or (n.nspname = 'auth' and pn.nspname = any(${SCHEMAS})))
         order by 2, 1`
      for (const t of triggers) {
        w(`DROP TRIGGER IF EXISTS ${q(t.tgname)} ON ${t.tabela};`)
        w(`${t.def};`)
      }
      w()

      // ---------------------------------------------------------------
      // RLS e políticas
      // ---------------------------------------------------------------
      w(`-- ========== RLS ==========`)
      for (const t of tabelas) {
        if (t.rls) w(`ALTER TABLE ${t.nome} ENABLE ROW LEVEL SECURITY;`)
        if (t.force_rls) w(`ALTER TABLE ${t.nome} FORCE ROW LEVEL SECURITY;`)
      }
      const politicas = await tx`
        select format('%I.%I', schemaname, tablename) as tabela, policyname,
               permissive, cmd, roles::text[] as roles, qual, with_check
          from pg_policies
         where schemaname = any(${SCHEMAS})
         order by 1, 2`
      for (const p of politicas) {
        const papeis = (p.roles as string[])
          .map((r) => (r === 'public' ? 'PUBLIC' : q(r)))
          .join(', ')
        let d = `CREATE POLICY ${q(p.policyname)} ON ${p.tabela} AS ${p.permissive} FOR ${p.cmd} TO ${papeis}`
        if (p.qual) d += ` USING (${p.qual})`
        if (p.with_check) d += ` WITH CHECK (${p.with_check})`
        w(`${d};`)
      }
      w()

      // ---------------------------------------------------------------
      // Grants dos papéis da API. REVOKE antes de tudo: projeto novo já
      // chega concedendo tudo, e o que vale é o que ESTE banco tinha.
      //
      // ⚠️ O privilégio MAINTAIN só existe a partir do Postgres 17 (o banco
      // é 17.6, e projeto novo do Supabase também nasce em 17). Restaurar
      // num 15 falha aqui — é o único ponto do arquivo preso à versão.
      // ---------------------------------------------------------------
      w(`-- ========== GRANTS ==========`)
      const grants = await tx`
        select format('%I.%I', n.nspname, c.relname) as tabela, r.rolname as papel,
               string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          cross join lateral aclexplode(c.relacl) a
          join pg_roles r on r.oid = a.grantee
         where n.nspname = any(${SCHEMAS}) and c.relkind = 'r'
           and r.rolname = any(${PAPEIS_API})
         group by 1, 2
         order by 1, 2`
      const papeisSql = PAPEIS_API.map(q).join(', ')
      for (const t of tabelas) w(`REVOKE ALL ON ${t.nome} FROM ${papeisSql};`)
      for (const g of grants) w(`GRANT ${g.privs} ON ${g.tabela} TO ${q(g.papel)};`)
      w()

      // Realtime: sem isto o tablet e o kanban conectam e nunca recebem
      // evento (ver 05_realtime.sql).
      w(`-- ========== REALTIME ==========`)
      const publicadas = await tx`
        select format('%I.%I', schemaname, tablename) as tabela
          from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = any(${SCHEMAS})
         order by 1`
      for (const p of publicadas) w(`ALTER PUBLICATION supabase_realtime ADD TABLE ${p.tabela};`)
      w()
      w(`COMMIT;`)

      // ---------------------------------------------------------------
      // MANIFESTO — o que o arquivo PROMETE, pra quem restaura conferir.
      //
      // Vem DEPOIS do COMMIT e só em comentário: não executa nada, e lido
      // aqui dentro ele é do MESMO retrato dos dados. `npm run db:restore`
      // lê estas linhas e compara com o destino, tabela a tabela. Mudou o
      // formato? Mude o leitor junto (scripts/restore-db.ts, `lerManifesto`).
      // ---------------------------------------------------------------
      const contador = await tx`
        select ano, ultimo_numero from public.op_numero_counter order by ano`
      const totalManifesto = linhasPorTabela.reduce((s, t) => s + t.linhas, 0)
      w()
      w(`-- ========== MANIFESTO ==========`)
      for (const t of linhasPorTabela) w(`-- manifesto:tabela ${t.tabela} ${t.linhas}`)
      w(`-- manifesto:total ${totalManifesto}`)
      w(`-- manifesto:triggers ${triggers.length}`)
      w(`-- manifesto:politicas ${politicas.length}`)
      w(
        `-- manifesto:op_numero_counter ${contador.map((c) => `${c.ano}=${c.ultimo_numero}`).join(',') || '-'}`,
      )
    })
  } finally {
    await sql.end()
    await new Promise<void>((ok) => out.end(ok))
  }

  const tamanho = statSync(arquivo).size
  const mb = (tamanho / 1024 / 1024).toFixed(2)
  const totalLinhas = linhasPorTabela.reduce((s, t) => s + t.linhas, 0)
  console.log(`✅ ${arquivo}`)
  console.log(`   ${mb} MB · ${linhasPorTabela.length} tabelas · ${totalLinhas} linhas`)

  // Cópia pro Drive. Falhar aqui NÃO invalida o backup local — mas avisa
  // alto, porque backup que só existe nesta máquina morre junto com ela.
  const drive = process.env.BACKUP_DRIVE_DIR
  let copiaDrive = false
  if (drive) {
    try {
      mkdirSync(drive, { recursive: true })
      const destino = join(drive, `vanvest-${dia}.sql`)
      copyFileSync(arquivo, destino)
      copiaDrive = true
      console.log(`✅ cópia no Drive: ${destino}`)
    } catch (e) {
      console.error(`⚠️ backup local OK, mas a cópia pro Drive falhou: ${(e as Error).message}`)
      process.exitCode = 1
    }
  } else {
    console.log('   (sem BACKUP_DRIVE_DIR no .env.local: a cópia ficou só nesta máquina)')
  }

  // O REGISTRO — a única escrita do backup (ver o topo). Conexão própria: a
  // do retrato já fechou, e esta nunca pode entrar naquela transação.
  // `arquivo` vai só com o NOME; o caminho desta máquina não é do banco.
  const registro = postgres(DATABASE_URL!, { max: 1, prepare: false })
  try {
    await registro`
      insert into public.backups_registro
        (arquivo, tamanho_bytes, tabelas, linhas, copia_drive, maquina)
      values (${basename(arquivo)}, ${tamanho}, ${linhasPorTabela.length},
              ${totalLinhas}, ${copiaDrive}, ${hostname()})`
    console.log(`✅ registrado em backups_registro (Drive: ${copiaDrive ? 'sim' : 'não'})`)
  } catch (e) {
    console.error(
      `⚠️ backup OK, mas o registro no banco falhou: ${(e as Error).message}\n` +
        '   O arquivo está salvo; o sistema só não vai saber deste backup.',
    )
    process.exitCode = 1
  } finally {
    await registro.end()
  }
}

main().catch((err) => {
  console.error('\n❌ Backup falhou:', err.message ?? err)
  process.exit(1)
})
