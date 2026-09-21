/**
 * Auditoria READ-ONLY da ADMINISTRAÇÃO antes do 1.0:
 * usuários, permissões, empresas, tarefas e lixeira.
 *
 * Não grava nada. A pergunta de cada bloco: tem alguém sem conseguir entrar,
 * alguma permissão que não faz o que promete, ou algo apagado que ninguém
 * sabe que sumiu?
 *
 *   npx tsx scripts/analise/auditoria-admin.ts
 */
import { config } from 'dotenv'
import postgres from 'postgres'

import { AREAS, nivelEfetivo, type AreaKey, type Role } from '../../src/lib/auth/permissoes'

config({ path: '.env.local', quiet: true })

const t = (s: string) => `\n════ ${s} ════`
const ok = (s: string) => `  ✔ ${s}`
const alerta = (s: string) => `  ⚠ ${s}`
const erro = (s: string) => `  ✖ ${s}`

async function main() {
  const sql = postgres(
    process.env.DATABASE_URL!.replace(':6543/', ':5432/'),
    { max: 1, prepare: false },
  )

  // ───────────────────────────── USUÁRIOS ─────────────────────────────
  console.log(t('USUÁRIOS'))

  const porCargo = await sql<{ role: string; ativos: number; inativos: number; apagados: number }[]>`
    select role,
           count(*) filter (where ativo and deleted_at is null)::int ativos,
           count(*) filter (where not ativo and deleted_at is null)::int inativos,
           count(*) filter (where deleted_at is not null)::int apagados
    from users group by role order by role`
  for (const c of porCargo) {
    console.log(`  ${c.role}: ${c.ativos} ativo(s), ${c.inativos} inativo(s), ${c.apagados} apagado(s)`)
  }
  const admins = porCargo.find((c) => c.role === 'admin')?.ativos ?? 0
  console.log(
    admins === 0
      ? erro('NENHUM admin ativo — ninguém consegue administrar o sistema')
      : admins === 1
        ? alerta('só 1 admin ativo: se ele perder o acesso, ninguém entra em /usuarios')
        : ok(`${admins} admins ativos`),
  )

  // O elo que quebra login: `public.users` e `auth.users` têm que casar.
  const semAuth = await sql<{ nome: string; email: string; role: string }[]>`
    select u.nome, u.email, u.role from users u
    where u.deleted_at is null and u.ativo
      and not exists (select 1 from auth.users a where a.id = u.id)
    order by u.nome`
  console.log(
    semAuth.length === 0
      ? ok('todo usuário ativo tem conta de login')
      : erro(`${semAuth.length} usuário(s) ativo(s) SEM conta de login (não conseguem entrar):`),
  )
  for (const u of semAuth) console.log(`      ${u.nome} <${u.email}> (${u.role})`)

  // ⚠️ CONTA DE LOGIN SEM PERFIL: o `requireAuth` faz signOut e manda pro
  // login, então ela não usa o sistema. Mas continua sendo credencial válida
  // no Supabase — e, o que é pior na prática, SEGURA O E-MAIL: criar um
  // usuário com o mesmo endereço falha com erro do provedor.
  //
  // Excluir usuário pela tela bane a conta por 100 anos (ver
  // `excluirUsuarioAction`). O que sobra sem banimento é semente antiga, que
  // nunca passou por essa tela.
  const semPerfil = await sql<{ email: string; banida: boolean; teve_perfil: boolean }[]>`
    select a.email,
           (a.banned_until is not null and a.banned_until > now()) banida,
           exists (select 1 from users u where u.id = a.id) teve_perfil
    from auth.users a
    where not exists (select 1 from users u where u.id = a.id and u.deleted_at is null)
    order by banida, a.email`
  const livres = semPerfil.filter((u) => !u.banida)
  console.log(
    semPerfil.length === 0
      ? ok('toda conta de login tem perfil no sistema')
      : `  ${semPerfil.length} conta(s) de login sem perfil ativo (${semPerfil.length - livres.length} banida(s) pela exclusão)`,
  )
  if (livres.length > 0) {
    console.log(
      erro(
        `${livres.length} dela(s) AINDA ACEITA(M) LOGIN: ` +
          livres.map((u) => u.email).join(', '),
      ),
    )
  }

  const duplicados = await sql<{ campo: string; valor: string; n: number }[]>`
    select 'email' campo, lower(trim(email)) valor, count(*)::int n from users
      where deleted_at is null group by 2 having count(*) > 1
    union all
    select 'nome', lower(trim(nome)), count(*)::int from users
      where deleted_at is null group by 2 having count(*) > 1`
  console.log(
    duplicados.length === 0
      ? ok('nenhum e-mail ou nome repetido')
      : alerta(duplicados.map((d) => `${d.campo} "${d.valor}" ×${d.n}`).join(', ')),
  )

  // PIN: é o que destrava o tablet da estação. Operador sem PIN não consegue
  // assumir OP — ver src/lib/auth/inatividade.ts.
  // O vínculo operador↔estação é a tabela `estacao_operadores` (N:N), e não
  // uma coluna em users — as colunas antigas ficaram no banco só como
  // histórico. Ver src/lib/db/schema/estacoes.ts.
  const semPin = await sql<{ nome: string; estacao: string | null }[]>`
    select u.nome,
           (select e.nome from estacao_operadores eo
             join estacoes e on e.id = eo.estacao_id and e.deleted_at is null
             where eo.operador_id = u.id limit 1) estacao
    from users u
    where u.deleted_at is null and u.ativo and u.role = 'operador' and u.pin_hash is null
    order by u.nome`
  console.log(
    semPin.length === 0
      ? ok('todo operador ativo tem PIN')
      : alerta(
          `${semPin.length} operador(es) sem PIN: ` +
            semPin.map((u) => `${u.nome}${u.estacao ? ` (${u.estacao})` : ' (sem estação)'}`).join(', '),
        ),
  )

  const semEstacao = await sql<{ nome: string }[]>`
    select u.nome from users u
    where u.deleted_at is null and u.ativo and u.role = 'operador'
      and not exists (
        select 1 from estacao_operadores eo
        join estacoes e on e.id = eo.estacao_id and e.deleted_at is null
        where eo.operador_id = u.id)
    order by u.nome`
  if (semEstacao.length > 0) {
    console.log(
      alerta(
        `${semEstacao.length} operador(es) sem estação (o tablet vira aviso): ` +
          semEstacao.map((u) => u.nome).join(', '),
      ),
    )
  }

  // ───────────────────────────── PERMISSÕES ─────────────────────────────
  console.log(t('PERMISSÕES'))

  const overrides = await sql<{ role: string; area: string; nivel: string }[]>`
    select role, area, nivel from permissoes_acesso order by area, role`
  console.log(`  ${overrides.length} override(s) gravado(s)`)

  const chavesValidas = new Set(AREAS.map((a) => a.key as string))
  const orfas = overrides.filter((o) => !chavesValidas.has(o.area))
  console.log(
    orfas.length === 0
      ? ok('toda override aponta pra uma área que existe')
      : alerta(
          `${orfas.length} override(s) de área que não existe mais (ignoradas em silêncio): ` +
            [...new Set(orfas.map((o) => o.area))].join(', '),
        ),
  )

  const naoEditaveis = new Set(AREAS.filter((a) => !a.editavel).map((a) => a.key as string))
  const inuteis = overrides.filter(
    (o) => o.role === 'admin' || naoEditaveis.has(o.area),
  )
  console.log(
    inuteis.length === 0
      ? ok('nenhuma override sem efeito')
      : alerta(
          `${inuteis.length} override(s) SEM EFEITO (admin é sempre total; área não editável ignora): ` +
            inuteis.map((o) => `${o.role}/${o.area}`).join(', '),
        ),
  )

  // O que cada cargo enxerga HOJE, com override e padrão — é o que a tela de
  // permissões promete, calculado pela mesma função que o app usa.
  const mapa: Record<string, string> = {}
  for (const o of overrides) mapa[`${o.role}:${o.area}`] = o.nivel
  const cargos: Role[] = ['gerente_producao', 'operador', 'estoquista', 'vendas']
  console.log('  áreas por cargo (nenhum / ver / total):')
  for (const cargo of cargos) {
    const cont = { nenhum: 0, ver: 0, total: 0, proprio: 0 }
    const abertas: string[] = []
    for (const a of AREAS) {
      const n = nivelEfetivo(cargo, a.key as AreaKey, mapa as Record<string, never>)
      cont[n] += 1
      if (n !== 'nenhum') abertas.push(a.key as string)
    }
    console.log(
      `    ${cargo.padEnd(17)} nenhum ${String(cont.nenhum).padStart(2)} | ver ${String(cont.ver).padStart(2)} | total ${String(cont.total).padStart(2)}`,
    )
  }

  // ───────────────────────────── EMPRESAS ─────────────────────────────
  console.log(t('EMPRESAS'))

  // Não há coluna `ativo` em empresas: a empresa existe ou está excluída.
  const empresas = await sql<
    { nome: string; cnpj: string | null; principal: boolean; cep: string | null; uf: string | null }[]
  >`select razao_social nome, cnpj, principal, cep, uf from empresas
    where deleted_at is null order by principal desc, razao_social`
  for (const e of empresas) {
    console.log(
      `  ${e.principal ? '★' : ' '} ${e.nome} · CNPJ ${e.cnpj ?? '—'} · CEP ${e.cep ?? '—'} ${e.uf ?? ''}`,
    )
  }
  const principais = empresas.filter((e) => e.principal)
  console.log(
    principais.length === 1
      ? ok('uma empresa principal definida')
      : principais.length === 0
        ? erro('NENHUMA empresa principal — o documento do pedido não sabe quem emite')
        : erro(`${principais.length} empresas marcadas como principal`),
  )
  // ⚠️ O CEP DA PRINCIPAL É A ORIGEM DA COTAÇÃO DE FRETE. Sem ele não há
  // cotação nenhuma — ver src/lib/frete.ts.
  // Só o CEP da PRINCIPAL é origem de frete; as outras podem ficar sem.
  const principalSemCep = empresas.find((e) => e.principal && !e.cep)
  console.log(
    principalSemCep
      ? erro(`a empresa principal (${principalSemCep.nome}) está SEM CEP — não há cotação de frete`)
      : ok('a empresa principal tem CEP de origem'),
  )
  const outrasSemCep = empresas.filter((e) => !e.principal && !e.cep)
  if (outrasSemCep.length > 0) {
    console.log(
      `  ${outrasSemCep.length} empresa(s) não principal(is) sem CEP — só importa se virarem a principal`,
    )
  }

  // ───────────────────────────── TAREFAS ─────────────────────────────
  console.log(t('TAREFAS'))

  const tar = await sql<{ abertas: number; concluidas: number; atrasadas: number; sem_prazo: number; apagadas: number }[]>`
    select
      count(*) filter (where concluida_em is null and deleted_at is null)::int abertas,
      count(*) filter (where concluida_em is not null and deleted_at is null)::int concluidas,
      count(*) filter (where concluida_em is null and deleted_at is null and prazo < current_date)::int atrasadas,
      count(*) filter (where concluida_em is null and deleted_at is null and prazo is null)::int sem_prazo,
      count(*) filter (where deleted_at is not null)::int apagadas
    from tarefas`
  const x = tar[0]!
  console.log(
    `  ${x.abertas} aberta(s), ${x.concluidas} concluída(s), ${x.apagadas} apagada(s)`,
  )
  if (x.atrasadas > 0) console.log(alerta(`${x.atrasadas} tarefa(s) com prazo vencido`))
  if (x.sem_prazo > 0) console.log(`  ${x.sem_prazo} aberta(s) sem prazo`)

  // As DIÁRIAS são a outra metade da tela: rotina que se repete. "Feita hoje"
  // não gera linha nova — é o instante da última conclusão que conta, e ele
  // deixa de valer quando vira o dia (ver o schema).
  const [di] = await sql<{ ativas: number; apagadas: number; feitas_hoje: number }[]>`
    select
      count(*) filter (where deleted_at is null)::int ativas,
      count(*) filter (where deleted_at is not null)::int apagadas,
      count(*) filter (
        where deleted_at is null and concluida_em is not null
          and (concluida_em at time zone 'America/Sao_Paulo')::date
              = (now() at time zone 'America/Sao_Paulo')::date
      )::int feitas_hoje
    from tarefas_diarias`
  console.log(
    `  diárias: ${di!.ativas} ativa(s), ${di!.apagadas} apagada(s), ${di!.feitas_hoje} marcada(s) hoje`,
  )

  const velhas = await sql<{ titulo: string; dias: number }[]>`
    select titulo, (current_date - created_at::date)::int dias from tarefas
    where concluida_em is null and deleted_at is null
    order by created_at limit 5`
  for (const v of velhas) console.log(`    aberta há ${v.dias} dia(s): ${v.titulo}`)

  // ───────────────────────────── LIXEIRA ─────────────────────────────
  console.log(t('LIXEIRA'))

  const tabelas = [
    'produtos', 'variacoes_produto', 'kits', 'cores', 'modelos', 'tamanhos',
    'ordens_producao', 'maquinas', 'estacoes', 'orcamentos', 'compradores',
    'vendas', 'lotes_fio', 'cores_fornecedor_fio', 'users', 'empresas',
    'tarefas', 'faixas_embalagem', 'remessas',
  ]
  let total = 0
  for (const tabela of tabelas) {
    // A lista é escrita à mão; tabela que não existe mais (ou que nunca teve
    // soft delete) é pulada em vez de derrubar a auditoria.
    const [existe] = await sql<{ n: number }[]>`
      select count(*)::int n from information_schema.columns
      where table_schema = 'public' and table_name = ${tabela}
        and column_name = 'deleted_at'`
    if (!existe || existe.n === 0) continue
    const [r] = await sql.unsafe(
      `select count(*)::int n, min(deleted_at)::date::text mais_antigo,
              max(deleted_at)::date::text mais_novo
       from ${tabela} where deleted_at is not null`,
    )
    const n = (r as { n: number }).n
    if (n > 0) {
      total += n
      const d = r as { mais_antigo: string; mais_novo: string }
      console.log(`  ${tabela}: ${n} apagado(s), de ${d.mais_antigo} a ${d.mais_novo}`)
    }
  }
  console.log(total === 0 ? ok('lixeira vazia') : `  total na lixeira: ${total}`)

  // ⚠️ A TELA DA LIXEIRA COBRE 11 TIPOS (produto, OP, kit, cor, modelo,
  // tamanho, máquina, estação, remessa, tarefa, diária). Tabela com soft
  // delete FORA dessa lista some sem caminho de volta pela interface — é isso
  // que o bloco abaixo procura.
  const naLixeira = [
    'produtos', 'ordens_producao', 'kits', 'cores', 'modelos', 'tamanhos',
    'maquinas', 'estacoes', 'remessas_full', 'tarefas', 'tarefas_diarias',
  ]
  const foraDaTela: string[] = []
  for (const tabela of tabelas) {
    if (naLixeira.includes(tabela)) continue
    const [existe] = await sql<{ n: number }[]>`
      select count(*)::int n from information_schema.columns
      where table_schema = 'public' and table_name = ${tabela}
        and column_name = 'deleted_at'`
    if (!existe || existe.n === 0) continue
    const [r] = await sql.unsafe(
      `select count(*)::int n from ${tabela} where deleted_at is not null`,
    )
    const n = (r as { n: number }).n
    if (n > 0) foraDaTela.push(`${tabela} (${n})`)
  }
  console.log(
    foraDaTela.length === 0
      ? ok('tudo que está apagado aparece na lixeira')
      : alerta(
          `apagado e FORA da lixeira (sem como restaurar pela tela): ` +
            foraDaTela.join(', '),
        ),
  )

  // Usuário apagado que ainda é dono de coisa viva: a tela mostra o vazio no
  // lugar do nome.
  const [orfaos] = await sql<{ ops: number; estacoes: number }[]>`
    select
      (select count(*)::int from ordens_producao o
        join users u on u.id = o.responsavel_id
        where o.deleted_at is null and u.deleted_at is not null) ops,
      (select count(*)::int from estacao_operadores eo
        join users u on u.id = eo.operador_id
        where u.deleted_at is not null) estacoes`
  if (orfaos!.ops > 0 || orfaos!.estacoes > 0) {
    console.log(
      alerta(
        `usuário apagado ainda vinculado: ${orfaos!.ops} OP(s) e ` +
          `${orfaos!.estacoes} vínculo(s) de estação`,
      ),
    )
  } else {
    console.log(ok('nenhum vínculo vivo apontando pra usuário apagado'))
  }

  // A lixeira mostra o que pode ser RESTAURADO. Item apagado cujo pai também
  // foi apagado restaura quebrado — vale saber se existe.
  const [opsOrfas] = await sql<{ n: number }[]>`
    select count(*)::int n from ordens_producao o
    join produtos p on p.id = o.produto_id
    where o.deleted_at is not null and p.deleted_at is not null`
  if (opsOrfas!.n > 0) {
    console.log(alerta(`${opsOrfas!.n} OP(s) na lixeira cujo produto também está apagado`))
  }

  await sql.end()
}

main().catch((e) => {
  console.error('ERRO', e)
  process.exit(1)
})
