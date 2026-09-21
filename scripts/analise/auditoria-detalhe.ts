/** Detalhe da auditoria — READ-ONLY. Onde exatamente estão os buracos. */
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local', quiet: true })

async function main() {
  const sql = postgres(
    process.env.DATABASE_URL!.replace(':6543/', ':5432/'),
    { max: 1, prepare: false },
  )

  console.log('\n════ PARES (produto, tamanho) SEM ANÚNCIO EM NENHUM CANAL ════')
  const sem = await sql<
    { produto: string; tamanho: string; ativo: boolean; atacado: string | null }[]
  >`
    select p.nome produto, v.tamanho, p.ativo,
           (select ptp.preco::text from produto_tamanho_preco ptp
             join tamanhos t2 on t2.id = ptp.tamanho_id
             where ptp.produto_id = p.id and lower(trim(t2.nome)) = lower(trim(v.tamanho))
             limit 1) atacado
    from (select distinct produto_id, tamanho from variacoes_produto
          where deleted_at is null and tamanho is not null and tamanho <> '') v
    join produtos p on p.id = v.produto_id and p.deleted_at is null
    where not exists (
      select 1 from produto_tamanho_preco_marketplace ptm
      join tamanhos t on t.id = ptm.tamanho_id
      where ptm.produto_id = v.produto_id and lower(trim(t.nome)) = lower(trim(v.tamanho)))
    order by p.ativo desc, p.nome, v.tamanho`
  for (const s of sem) {
    console.log(
      `  ${s.ativo ? 'ativo ' : 'INATIVO'} ${s.produto} / ${s.tamanho}` +
        (s.atacado ? ` (atacado ${s.atacado})` : ' (sem preço de atacado também)'),
    )
  }
  console.log(`  total: ${sem.length}`)

  console.log('\n════ CANAIS POR PAR: quem tem anúncio em quantos ════')
  const canais = await sql<{ canais: number; pares: number }[]>`
    select canais, count(*)::int pares from (
      select ptm.produto_id, ptm.tamanho_id, count(distinct ptm.marketplace)::int canais
      from produto_tamanho_preco_marketplace ptm group by 1, 2
    ) x group by 1 order by 1`
  for (const c of canais) console.log(`  ${c.canais} canal(is): ${c.pares} par(es)`)

  console.log('\n════ KITS: anúncio por combinação ════')
  const kitsLinhas = await sql<{ kit: string; combinacoes: number; canais: string }[]>`
    select k.nome kit, count(distinct ktm.combinacao)::int combinacoes,
           string_agg(distinct ktm.marketplace, ', ') canais
    from kit_tamanho_preco_marketplace ktm
    join kits k on k.id = ktm.kit_id
    group by 1 order by 1`
  for (const k of kitsLinhas) {
    console.log(`  ${k.kit}: ${k.combinacoes} combinação(ões) — ${k.canais}`)
  }
  const kitsSem = await sql<{ nome: string; ativo: boolean }[]>`
    select nome, ativo from kits k
    where k.deleted_at is null and not exists (
      select 1 from kit_tamanho_preco_marketplace ktm where ktm.kit_id = k.id)
    order by ativo desc, nome`
  console.log(`  kits SEM nenhum anúncio: ${kitsSem.length}`)
  for (const k of kitsSem) console.log(`    ${k.ativo ? 'ativo ' : 'INATIVO'} ${k.nome}`)

  console.log('\n════ VARIAÇÕES: duplicidade e composição ════')
  const dup = await sql<{ produto: string; cor: string; modelo: string; tamanho: string; n: number }[]>`
    select p.nome produto, coalesce(v.cor,'—') cor, coalesce(v.modelo,'—') modelo,
           coalesce(v.tamanho,'—') tamanho, count(*)::int n
    from variacoes_produto v
    join produtos p on p.id = v.produto_id and p.deleted_at is null
    where v.deleted_at is null
    group by 1,2,3,4 having count(*) > 1 order by 5 desc limit 10`
  console.log(
    dup.length === 0
      ? '  ✔ nenhuma variação repetida (mesmo produto, cor, modelo e tamanho)'
      : `  ⚠ ${dup.length} combinação(ões) repetida(s):`,
  )
  for (const d of dup) console.log(`    ${d.produto}: ${d.cor}/${d.modelo}/${d.tamanho} ×${d.n}`)

  const comp = await sql<{ campo: string; vazios: number }[]>`
    select 'cor vazia' campo, count(*)::int vazios from variacoes_produto v
      join produtos p on p.id = v.produto_id and p.deleted_at is null
      where v.deleted_at is null and (v.cor is null or trim(v.cor) = '')
    union all
    select 'modelo vazio', count(*)::int from variacoes_produto v
      join produtos p on p.id = v.produto_id and p.deleted_at is null
      where v.deleted_at is null and (v.modelo is null or trim(v.modelo) = '')`
  for (const c of comp) console.log(`  ${c.campo}: ${c.vazios}`)

  const usoCores = await sql<{ nome: string; n: number }[]>`
    select c.nome, count(v.id)::int n from cores c
    left join variacoes_produto v
      on lower(trim(v.cor)) = lower(trim(c.nome)) and v.deleted_at is null
    where c.deleted_at is null group by 1 having count(v.id) = 0 order by 1`
  console.log(`  cores ativas sem nenhuma variação: ${usoCores.length}`)
  if (usoCores.length > 0) {
    console.log('    ' + usoCores.map((c) => c.nome).join(', '))
  }

  console.log('\n════ PERMISSÕES DAS TRÊS TELAS ════')
  const perms = await sql<{ area: string; role: string; nivel: string }[]>`
    select area, role, nivel from permissoes_acesso
    where area in ('precosMarketplace','cores','modelos','tamanhos','faixasEmbalagem')
    order by area, role`
  let areaAtual = ''
  for (const p of perms) {
    if (p.area !== areaAtual) {
      areaAtual = p.area
      console.log(`  ${p.area}:`)
    }
    console.log(`    ${p.role} = ${p.nivel}`)
  }

  await sql.end()
}

main().catch((e) => {
  console.error('ERRO', e)
  process.exit(1)
})
