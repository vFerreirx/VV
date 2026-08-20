/**
 * Confere a carga aplicada. READ-ONLY.
 *
 * A pergunta que importa: a `combinacao` que o SQL montou é EXATAMENTE a que
 * `chaveDeTamanhos` produz? Se não for, o preço está gravado numa chave que
 * o pedido/tela nunca vai procurar — inalcançável, e em silêncio.
 */
import { config } from 'dotenv'
import postgres from 'postgres'

import {
  chaveDeTamanhos,
  combinacoesDeTamanho,
  descreverCombinacao,
} from '../../src/lib/kit-tamanhos'

config({ path: '.env.local', quiet: true })

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })

  const produtos = await sql<{ id: string; nome: string; tamanhos: string[] }[]>`
    SELECT p.id, p.nome,
      COALESCE((SELECT array_agg(DISTINCT v.tamanho) FROM variacoes_produto v
        WHERE v.produto_id = p.id AND v.deleted_at IS NULL), '{}') AS tamanhos
    FROM produtos p WHERE p.deleted_at IS NULL`
  const itens = await sql<{ kitId: string; produtoId: string }[]>`
    SELECT kit_id AS "kitId", produto_id AS "produtoId" FROM kit_itens`
  const kits = await sql<{ id: string; nome: string }[]>`
    SELECT id, nome FROM kits WHERE deleted_at IS NULL`

  const porId = new Map(produtos.map((p) => [p.id, p]))
  const tamanhosDe = (id: string) => porId.get(id)?.tamanhos ?? []
  const compsDe = (kitId: string) =>
    itens.filter((i) => i.kitId === kitId).map((i) => ({ produtoId: i.produtoId }))

  console.log('════ CONTAGENS ════')
  console.table(
    await sql`SELECT
    (SELECT count(*)::int FROM produto_tamanho_preco_marketplace) AS produto_mkt,
    (SELECT count(*)::int FROM kit_tamanho_preco_marketplace)     AS kit_mkt,
    (SELECT count(*)::int FROM produto_tamanho_preco)             AS produto_atacado,
    (SELECT count(*)::int FROM kit_tamanho_preco)                 AS kit_atacado`,
  )

  console.log('\n════ POR MARKETPLACE ════')
  console.table(
    await sql`
    SELECT marketplace, count(*)::int AS linhas FROM (
      SELECT marketplace FROM produto_tamanho_preco_marketplace
      UNION ALL SELECT marketplace FROM kit_tamanho_preco_marketplace
    ) x GROUP BY 1 ORDER BY 1`,
  )

  // ── A conferência crítica ────────────────────────────────────────
  const gravadas = await sql<
    { kitId: string; kitNome: string; combinacao: string; marketplace: string; preco: string }[]
  >`
    SELECT kp.kit_id AS "kitId", k.nome AS "kitNome", kp.combinacao,
           kp.marketplace, kp.preco
    FROM kit_tamanho_preco_marketplace kp
    JOIN kits k ON k.id = kp.kit_id`

  let alcancaveis = 0
  const orfas: string[] = []
  for (const g of gravadas) {
    const comps = compsDe(g.kitId)
    // Todas as chaves que o sistema consegue PRODUZIR pra este kit.
    const possiveis = new Set(
      combinacoesDeTamanho(comps, tamanhosDe)
        .map((e) => chaveDeTamanhos(comps, e, tamanhosDe))
        .filter((c): c is string => c !== null),
    )
    if (possiveis.has(g.combinacao)) alcancaveis++
    else
      orfas.push(
        `${g.kitNome} [${g.marketplace}] chave="${g.combinacao}" — o kit produz: ${[...possiveis].map((p) => `"${p}"`).join(', ')}`,
      )
  }

  console.log('\n════ A CHAVE DO SQL BATE COM A DO TYPESCRIPT? ════')
  console.log(`  linhas de kit gravadas : ${gravadas.length}`)
  console.log(`  ALCANÇÁVEIS pelo sistema: ${alcancaveis}`)
  console.log(`  órfãs (inalcançáveis)   : ${orfas.length}`)
  for (const o of orfas) console.log('    ✗ ' + o)
  console.log(
    orfas.length === 0
      ? '  >>> TODAS ALCANÇÁVEIS — a chave do SQL == a do chaveDeTamanhos.'
      : '  >>> DIVERGIU!',
  )

  // ── Amostra legível do kit de dois tamanhos ──────────────────────
  const aconchego = kits.find((k) => k.nome === 'Kit Peseira+ 2 Capas de Almofada - ACONCHEGO')!
  const comps = compsDe(aconchego.id).map((c) => ({
    ...c,
    nome: porId.get(c.produtoId)!.nome,
  }))
  console.log('\n════ Kit Peseira+2 Capas ACONCHEGO — preço por combinação ════')
  const linhas: Record<string, Record<string, string>> = {}
  for (const escolhas of combinacoesDeTamanho(comps, tamanhosDe)) {
    const ch = chaveDeTamanhos(comps, escolhas, tamanhosDe)
    if (ch === null) continue
    const rot = descreverCombinacao(comps, escolhas, tamanhosDe)
      .replace(/Capa de Almofada - ACONCHEGO/, 'capa')
      .replace(/Peseira - ACONCHEGO/, 'peseira')
    const dessa = gravadas.filter((g) => g.kitId === aconchego.id && g.combinacao === ch)
    if (dessa.length === 0) continue
    linhas[rot] = Object.fromEntries(dessa.map((d) => [d.marketplace, `R$ ${d.preco}`]))
  }
  console.table(linhas)

  await sql.end()
}

void main()
