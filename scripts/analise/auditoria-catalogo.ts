/**
 * Auditoria READ-ONLY de três cadastros antes do 1.0:
 * preço de marketplace, variações (cores/modelos/tamanhos) e faixas de
 * embalagem.
 *
 * Não grava nada. A pergunta de cada bloco é sempre a mesma: existe dado
 * cadastrado que o sistema nunca vai alcançar, ou buraco que só vai aparecer
 * na frente do cliente?
 *
 *   npx tsx scripts/analise/auditoria-catalogo.ts
 */
import { config } from 'dotenv'
import postgres from 'postgres'

import { avaliarMedidas, capacidadeGramas, faixaPara, ordenarFaixas } from '../../src/lib/frete'
import { CANAIS_COM_PRECO } from '../../src/lib/preco-marketplace'

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

  // ───────────────────────────── MARKETPLACE ─────────────────────────────
  console.log(t('PREÇO DE MARKETPLACE'))

  const porCanal = await sql<{ marketplace: string; produto: number; kit: number }[]>`
    select m.marketplace,
           count(*) filter (where m.tipo = 'produto')::int produto,
           count(*) filter (where m.tipo = 'kit')::int kit
    from (
      select marketplace, 'produto' tipo from produto_tamanho_preco_marketplace
      union all
      select marketplace, 'kit' tipo from kit_tamanho_preco_marketplace
    ) m group by m.marketplace order by m.marketplace`
  const comPreco = new Set(porCanal.map((c) => c.marketplace))
  for (const c of porCanal) {
    console.log(ok(`${c.marketplace}: ${c.produto} de produto + ${c.kit} de kit`))
  }
  for (const canal of CANAIS_COM_PRECO) {
    if (!comPreco.has(canal)) console.log(alerta(`${canal}: NENHUM preço cadastrado`))
  }

  // Vendeu no canal, mas não tem preço de anúncio nenhum? (vendas por canal)
  const vendasPorCanal = await sql<{ marketplace: string; pecas: number; dias: number }[]>`
    select marketplace, sum(quantidade)::int pecas, count(distinct venda_id)::int dias
    from vendas_marketplace group by marketplace order by 2 desc`
  for (const v of vendasPorCanal) {
    if (v.marketplace === 'vendas_atacado') continue
    if (!comPreco.has(v.marketplace)) {
      console.log(
        alerta(
          `${v.marketplace} vendeu ${v.pecas} peças em ${v.dias} dias e não tem preço de anúncio`,
        ),
      )
    }
  }

  // Cobertura: quantos (produto, tamanho) do catálogo têm anúncio em cada canal.
  const paresCatalogo = await sql<{ pares: number }[]>`
    select count(*)::int pares from (
      select distinct v.produto_id, lower(trim(v.tamanho)) tam
      from variacoes_produto v
      join produtos p on p.id = v.produto_id and p.deleted_at is null
      where v.deleted_at is null and v.tamanho is not null and v.tamanho <> ''
    ) x`
  const cobertura = await sql<{ marketplace: string; pares: number }[]>`
    select ptm.marketplace, count(distinct (ptm.produto_id::text || '|' || lower(trim(t.nome))))::int pares
    from produto_tamanho_preco_marketplace ptm
    join tamanhos t on t.id = ptm.tamanho_id
    group by ptm.marketplace order by 1`
  console.log(`  pares (produto, tamanho) no catálogo: ${paresCatalogo[0]!.pares}`)
  for (const c of cobertura) {
    const pct = Math.round((c.pares / paresCatalogo[0]!.pares) * 100)
    console.log(`    ${c.marketplace}: ${c.pares} com anúncio (${pct}%)`)
  }

  // Preço gravado que a tela/pedido nunca alcança: produto apagado, tamanho
  // apagado, ou par que não existe mais em nenhuma variação.
  const orfaos = await sql<{ motivo: string; n: number }[]>`
    select 'produto apagado' motivo, count(*)::int n
      from produto_tamanho_preco_marketplace ptm
      join produtos p on p.id = ptm.produto_id
      where p.deleted_at is not null
    union all
    select 'tamanho apagado', count(*)::int
      from produto_tamanho_preco_marketplace ptm
      join tamanhos t on t.id = ptm.tamanho_id
      where t.deleted_at is not null
    union all
    select 'par sem variação viva', count(*)::int
      from produto_tamanho_preco_marketplace ptm
      join tamanhos t on t.id = ptm.tamanho_id
      where not exists (
        select 1 from variacoes_produto v
        where v.produto_id = ptm.produto_id
          and v.deleted_at is null
          and lower(trim(v.tamanho)) = lower(trim(t.nome)))
    union all
    select 'kit apagado', count(*)::int
      from kit_tamanho_preco_marketplace ktm
      join kits k on k.id = ktm.kit_id
      where k.deleted_at is not null`
  for (const o of orfaos) {
    console.log(o.n === 0 ? ok(`${o.motivo}: 0`) : erro(`${o.motivo}: ${o.n} linha(s)`))
  }

  // Anúncio mais barato que o atacado: possível, mas quase sempre é engano —
  // o preço de anúncio já embute comissão, frete grátis e imposto.
  const abaixoDoAtacado = await sql<
    { produto: string; tamanho: string; marketplace: string; anuncio: string; atacado: string }[]
  >`
    select p.nome produto, t.nome tamanho, ptm.marketplace,
           ptm.preco::text anuncio, ptp.preco::text atacado
    from produto_tamanho_preco_marketplace ptm
    join produto_tamanho_preco ptp
      on ptp.produto_id = ptm.produto_id and ptp.tamanho_id = ptm.tamanho_id
    join produtos p on p.id = ptm.produto_id
    join tamanhos t on t.id = ptm.tamanho_id
    where ptm.preco <= ptp.preco
    order by 1, 2`
  console.log(
    abaixoDoAtacado.length === 0
      ? ok('nenhum anúncio abaixo (ou igual) do preço de atacado')
      : alerta(`${abaixoDoAtacado.length} anúncio(s) <= preço de atacado:`),
  )
  for (const a of abaixoDoAtacado.slice(0, 10)) {
    console.log(
      `      ${a.produto} / ${a.tamanho} / ${a.marketplace}: anúncio ${a.anuncio} vs atacado ${a.atacado}`,
    )
  }

  const zerados = await sql<{ n: number }[]>`
    select (
      (select count(*) from produto_tamanho_preco_marketplace where preco <= 0) +
      (select count(*) from kit_tamanho_preco_marketplace where preco <= 0)
    )::int n`
  console.log(
    zerados[0]!.n === 0 ? ok('nenhum preço zerado') : erro(`${zerados[0]!.n} preço(s) <= 0`),
  )

  // ───────────────────────────── VARIAÇÕES ─────────────────────────────
  console.log(t('VARIAÇÕES (cores, modelos, tamanhos)'))

  const catalogo = await sql<{ tabela: string; ativos: number; inativos: number; apagados: number }[]>`
    select 'cores' tabela,
           count(*) filter (where ativo and deleted_at is null)::int ativos,
           count(*) filter (where not ativo and deleted_at is null)::int inativos,
           count(*) filter (where deleted_at is not null)::int apagados
      from cores
    union all
    select 'modelos',
           count(*) filter (where ativo and deleted_at is null)::int,
           count(*) filter (where not ativo and deleted_at is null)::int,
           count(*) filter (where deleted_at is not null)::int
      from modelos
    union all
    select 'tamanhos',
           count(*) filter (where ativo and deleted_at is null)::int,
           count(*) filter (where not ativo and deleted_at is null)::int,
           count(*) filter (where deleted_at is not null)::int
      from tamanhos`
  for (const c of catalogo) {
    console.log(`  ${c.tabela}: ${c.ativos} ativos, ${c.inativos} inativos, ${c.apagados} apagados`)
  }

  // ⚠️ `variacoes_produto` guarda TEXTO, não FK: um nome que não existe no
  // catálogo não quebra nada na hora, mas some do filtro e perde o peso/preço
  // do tamanho (que são por NOME).
  for (const [campo, tabela] of [
    ['cor', 'cores'],
    ['modelo', 'modelos'],
    ['tamanho', 'tamanhos'],
  ] as const) {
    const fora = await sql<{ valor: string; n: number }[]>`
      select v.${sql(campo)} valor, count(*)::int n
      from variacoes_produto v
      join produtos p on p.id = v.produto_id and p.deleted_at is null
      where v.deleted_at is null and v.${sql(campo)} is not null and v.${sql(campo)} <> ''
        and not exists (
          select 1 from ${sql(tabela)} c
          where c.deleted_at is null and lower(trim(c.nome)) = lower(trim(v.${sql(campo)})))
      group by 1 order by 2 desc`
    if (fora.length === 0) {
      console.log(ok(`todo ${campo} das variações existe em ${tabela}`))
    } else {
      console.log(
        erro(
          `${fora.reduce((s, f) => s + f.n, 0)} variação(ões) com ${campo} fora do cadastro: ` +
            fora.map((f) => `"${f.valor}" (${f.n})`).join(', '),
        ),
      )
    }

    const inativoEmUso = await sql<{ valor: string; n: number }[]>`
      select c.nome valor, count(*)::int n
      from variacoes_produto v
      join produtos p on p.id = v.produto_id and p.deleted_at is null
      join ${sql(tabela)} c on lower(trim(c.nome)) = lower(trim(v.${sql(campo)}))
      where v.deleted_at is null and c.deleted_at is null and not c.ativo
      group by 1 order by 2 desc`
    if (inativoEmUso.length > 0) {
      console.log(
        alerta(
          `${campo} INATIVO ainda em uso: ` +
            inativoEmUso.map((f) => `"${f.valor}" (${f.n})`).join(', '),
        ),
      )
    }
  }

  const skus = await sql<{ problema: string; n: number }[]>`
    select 'sem SKU' problema, count(*)::int n
      from variacoes_produto v join produtos p on p.id = v.produto_id and p.deleted_at is null
      where v.deleted_at is null and (v.sku_variacao is null or trim(v.sku_variacao) = '')
    union all
    select 'SKU repetido', coalesce(sum(c - 1), 0)::int from (
      select count(*) c from variacoes_produto v
      join produtos p on p.id = v.produto_id and p.deleted_at is null
      where v.deleted_at is null group by lower(trim(v.sku_variacao)) having count(*) > 1) x
    union all
    select 'sem tamanho', count(*)::int
      from variacoes_produto v join produtos p on p.id = v.produto_id and p.deleted_at is null
      where v.deleted_at is null and (v.tamanho is null or trim(v.tamanho) = '')
    union all
    select 'produto sem variação ativa', count(*)::int from produtos p
      where p.deleted_at is null and p.ativo and not exists (
        select 1 from variacoes_produto v where v.produto_id = p.id and v.deleted_at is null)`
  for (const s of skus) {
    console.log(s.n === 0 ? ok(`${s.problema}: 0`) : alerta(`${s.problema}: ${s.n}`))
  }

  // Tamanho sem peso padrão: o frete do pedido cai pra 0 quando o par
  // (produto, tamanho) também não tem peso. Ver src/lib/peso.ts.
  const semPeso = await sql<{ nome: string; usado: number }[]>`
    select t.nome, count(distinct v.produto_id)::int usado
    from tamanhos t
    left join variacoes_produto v
      on lower(trim(v.tamanho)) = lower(trim(t.nome)) and v.deleted_at is null
    where t.deleted_at is null and t.ativo and t.peso_gramas is null
    group by 1 order by 2 desc`
  if (semPeso.length === 0) console.log(ok('todo tamanho ativo tem peso padrão'))
  else
    for (const s of semPeso) {
      console.log(
        s.usado > 0
          ? erro(`tamanho "${s.nome}" SEM peso padrão e usado por ${s.usado} produto(s)`)
          : alerta(`tamanho "${s.nome}" sem peso padrão (não usado)`),
      )
    }

  // Par (produto, tamanho) sem peso próprio E sem peso do tamanho = 0 g no frete.
  const semPesoNenhum = await sql<{ produto: string; tamanho: string }[]>`
    select distinct p.nome produto, v.tamanho
    from variacoes_produto v
    join produtos p on p.id = v.produto_id and p.deleted_at is null
    left join tamanhos t on lower(trim(t.nome)) = lower(trim(v.tamanho)) and t.deleted_at is null
    left join produto_tamanho_peso ptp on ptp.produto_id = v.produto_id and ptp.tamanho_id = t.id
    where v.deleted_at is null and v.tamanho is not null and v.tamanho <> ''
      and ptp.peso_gramas is null and (t.peso_gramas is null)
    order by 1, 2`
  console.log(
    semPesoNenhum.length === 0
      ? ok('todo par (produto, tamanho) tem peso pra cotar frete')
      : erro(`${semPesoNenhum.length} par(es) sem peso nenhum — frete sairia com 0 g:`),
  )
  for (const x of semPesoNenhum.slice(0, 10)) console.log(`      ${x.produto} / ${x.tamanho}`)

  // ─────────────────────────── FAIXAS DE EMBALAGEM ───────────────────────
  console.log(t('FAIXAS DE EMBALAGEM'))

  const faixasRows = await sql<
    { peso_ate_gramas: number; altura_cm: string; largura_cm: string; comprimento_cm: string }[]
  >`select peso_ate_gramas, altura_cm, largura_cm, comprimento_cm
    from faixas_embalagem where deleted_at is null order by peso_ate_gramas`
  const faixas = faixasRows.map((f) => ({
    pesoAteGramas: f.peso_ate_gramas,
    alturaCm: Number(f.altura_cm),
    larguraCm: Number(f.largura_cm),
    comprimentoCm: Number(f.comprimento_cm),
  }))

  if (faixas.length === 0) {
    console.log(erro('NENHUMA faixa cadastrada — o pedido não consegue cotar frete'))
  }
  for (const f of ordenarFaixas(faixas)) {
    const a = avaliarMedidas(f)
    const medidas = `${f.alturaCm}×${f.larguraCm}×${f.comprimentoCm} cm`
    const linha = `até ${f.pesoAteGramas} g: ${medidas}`
    if (a.erros.length > 0) console.log(erro(`${linha} → ${a.erros.join(' ')}`))
    else if (a.avisos.length > 0) console.log(alerta(`${linha} → ${a.avisos.join(' ')}`))
    else console.log(ok(linha))
  }
  console.log(`  capacidade de um pacote: ${capacidadeGramas(faixas)} g`)

  // Buracos: um peso comum que cai numa faixa muito maior que ele indica
  // faixa faltando no meio.
  const degraus = ordenarFaixas(faixas)
  for (let i = 1; i < degraus.length; i++) {
    const anterior = degraus[i - 1]!.pesoAteGramas
    const atual = degraus[i]!.pesoAteGramas
    if (atual > anterior * 2.5) {
      console.log(
        alerta(
          `salto de ${anterior} g pra ${atual} g: um pacote de ${anterior + 1} g ` +
            `sai com a caixa de ${atual} g`,
        ),
      )
    }
  }

  // O peso real dos pedidos cabe nas faixas?
  const pesos = await sql<{ menor: number; maior: number; media: number; n: number }[]>`
    select min(peso)::int menor, max(peso)::int maior, avg(peso)::int media, count(*)::int n
    from (
      select oi.orcamento_id, sum(coalesce(ptp.peso_gramas, t.peso_gramas, 0) * oi.quantidade) peso
      from orcamento_itens oi
      join orcamentos o on o.id = oi.orcamento_id and o.deleted_at is null
      left join tamanhos t on lower(trim(t.nome)) = lower(trim(oi.tamanho)) and t.deleted_at is null
      left join produto_tamanho_peso ptp
        on ptp.produto_id = oi.produto_id and ptp.tamanho_id = t.id
      group by 1
    ) x where peso > 0`
  const p = pesos[0]
  if (p && p.n > 0) {
    console.log(
      `  peso dos pedidos: menor ${p.menor} g, médio ${p.media} g, maior ${p.maior} g (${p.n} pedidos)`,
    )
    const menorFaixa = degraus[0]?.pesoAteGramas ?? 0
    if (p.menor < menorFaixa / 3) {
      console.log(
        alerta(
          `o pedido mais leve tem ${p.menor} g e a menor faixa é de ${menorFaixa} g — ` +
            `pacote pequeno sai com caixa grande`,
        ),
      )
    }
    const cabe = faixaPara(p.maior, faixas)
    console.log(
      cabe
        ? ok(`o pedido mais pesado (${p.maior} g) cabe na faixa de ${cabe.pesoAteGramas} g`)
        : alerta(
            `o pedido mais pesado (${p.maior} g) passa da capacidade ` +
              `(${capacidadeGramas(faixas)} g) e vira mais de um pacote`,
          ),
    )
  }

  await sql.end()
}

main().catch((e) => {
  console.error('ERRO', e)
  process.exit(1)
})
