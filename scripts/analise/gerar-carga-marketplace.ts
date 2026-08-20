/**
 * Gera supabase/sql/48_preco_marketplace_carga.sql a partir das duas
 * planilhas da Área de Trabalho, conferindo tudo contra o catálogo real.
 *
 * READ-ONLY no banco: só lê catálogo pra validar. Quem grava é o SQL gerado,
 * rodado pelo `npm run db:setup`.
 *
 * Uso: npx tsx scripts/analise/gerar-carga-marketplace.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'
import postgres from 'postgres'

import { chaveDeTamanhos } from '../../src/lib/kit-tamanhos'

config({ path: '.env.local', quiet: true })

const DIR = 'C:/Users/willi/OneDrive/Área de Trabalho'
const SAIDA = 'supabase/sql/48_preco_marketplace_carga.sql'

// ── Correspondências EXPLÍCITAS planilha → catálogo ──────────────────
// O código da planilha nem sempre bate com o SKU, e adivinhar por
// aproximação de nome é como se erra preço em silêncio. Tudo à mão, visível.
const MODELO_DA_PLANILHA: Record<string, string> = {
  '059-LINKS': 'LINKS',
  // "3D" na planilha, "EFEITO 3D" no cadastro.
  '076-3D': 'EFEITO 3D',
  '072-RELEVO': 'RELEVO',
  '085-ARAN': 'ARAN',
  '086-SOFISTICADA': 'SOFISTICADA',
  '087-TRANÇAS': 'TRANÇAS',
  '094-SIENA': 'SIENA',
  '095-ACONCHEGO': 'ACONCHEGO',
  // A MANTA ACONCHEGO é 104 na planilha, mas o produto no sistema tem SKU
  // começando em 095. Mesmo modelo.
  '104-ACONCHEGO': 'ACONCHEGO',
}

const MARKETPLACE_DO_SUFIXO: Record<string, string> = {
  ML: 'mercado_livre',
  SHOPEE: 'shopee',
  SHEIN: 'shein',
}

// ── CSV ──────────────────────────────────────────────────────────────
function lerCsv(nome: string): string[][] {
  return readFileSync(`${DIR}/${nome}`, 'utf-8')
    .trim()
    .split(/\r?\n/)
    .map((linha) => {
      const campos: string[] = []
      let atual = ''
      let aspas = false
      for (const ch of linha) {
        if (ch === '"') aspas = !aspas
        else if (ch === ',' && !aspas) {
          campos.push(atual)
          atual = ''
        } else atual += ch
      }
      campos.push(atual)
      return campos.map((c) => c.trim())
    })
}

/** "R$ 1.149,99" → 114999 centavos. Vazio → null. */
function paraCentavos(v: string): number | null {
  const limpo = v.replace(/[R$\s.]/g, '').replace(',', '.')
  return limpo === '' ? null : Math.round(Number(limpo) * 100)
}

const reais = (centavos: number) => (centavos / 100).toFixed(2)

// ── O que cada coluna quer dizer ─────────────────────────────────────
// `papel` diz QUAL componente do kit o tamanho da coluna fixa. É por papel
// (peseira/capa) e não por posição porque a lista de componentes de cada kit
// vem em ordem própria do banco.
type Coluna =
  | { tipo: 'produto'; prefixo: string; tamanho: string }
  | { tipo: 'kit'; kit: 'peseira' | 'manta'; papel: 'peseira' | 'capa'; tamanho: string }
  | { tipo: 'combo' }

const COLUNAS: Record<string, Coluna> = {
  'PESEIRA CASAL': { tipo: 'produto', prefixo: 'Peseira', tamanho: 'Casal' },
  'PESEIRA QUEEN': { tipo: 'produto', prefixo: 'Peseira', tamanho: 'Queen' },
  'PESEIRA KING': { tipo: 'produto', prefixo: 'Peseira', tamanho: 'King' },
  'MANTA 150x100': { tipo: 'produto', prefixo: 'Manta', tamanho: 'Manta' },
  'KIT CASAL': { tipo: 'kit', kit: 'peseira', papel: 'peseira', tamanho: 'Casal' },
  'KIT QUEEN': { tipo: 'kit', kit: 'peseira', papel: 'peseira', tamanho: 'Queen' },
  'KIT KING': { tipo: 'kit', kit: 'peseira', papel: 'peseira', tamanho: 'King' },
  'KIT 45CM': { tipo: 'kit', kit: 'manta', papel: 'capa', tamanho: '45x45' },
  'KIT 50CM': { tipo: 'kit', kit: 'manta', papel: 'capa', tamanho: '50x50' },
  'KIT 60CM': { tipo: 'kit', kit: 'manta', papel: 'capa', tamanho: '60x60' },
  // Combos vendidos como anúncio; não existem como kit no catálogo.
  '2 CAPAS': { tipo: 'combo' },
  '3 CAPAS': { tipo: 'combo' },
  '4 CAPAS': { tipo: 'combo' },
}

type Produto = { id: string; nome: string; tamanhos: string[] }
type KitCat = { id: string; nome: string; componentes: { produtoId: string }[] }

type LinhaProduto = {
  produto: string
  tamanho: string
  marketplace: string
  centavos: number
  origem: string
}
type LinhaKit = {
  kitNome: string
  escolhas: string[] // "Nome do Produto=Tamanho", só componentes VARIÁVEIS
  combinacao: string // conferida em TS pela mesma chaveDeTamanhos
  marketplace: string
  centavos: number
  origem: string
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
  const produtos = await sql<Produto[]>`
    SELECT p.id, p.nome,
      COALESCE((SELECT array_agg(DISTINCT v.tamanho) FROM variacoes_produto v
        WHERE v.produto_id = p.id AND v.deleted_at IS NULL), '{}') AS tamanhos
    FROM produtos p WHERE p.deleted_at IS NULL`
  const kitsBrutos = await sql<{ id: string; nome: string }[]>`
    SELECT id, nome FROM kits WHERE deleted_at IS NULL`
  const itensKit = await sql<{ kitId: string; produtoId: string }[]>`
    SELECT kit_id AS "kitId", produto_id AS "produtoId" FROM kit_itens`
  const modelos = new Set(
    (await sql<{ nome: string }[]>`SELECT nome FROM modelos WHERE deleted_at IS NULL`).map(
      (m) => m.nome,
    ),
  )
  await sql.end()

  const porId = new Map(produtos.map((p) => [p.id, p]))
  const porNome = new Map(produtos.map((p) => [p.nome.toLowerCase(), p]))
  const kits: KitCat[] = kitsBrutos.map((k) => ({
    ...k,
    componentes: itensKit.filter((i) => i.kitId === k.id).map((i) => ({ produtoId: i.produtoId })),
  }))
  // A MESMA função do builder do pedido e do cadastro. É ela que garante que
  // a chave gravada aqui é a que o sistema vai procurar depois.
  const tamanhosDe = (produtoId: string) => porId.get(produtoId)?.tamanhos ?? []

  const acharKit = (tipo: 'peseira' | 'manta', modelo: string) => {
    const re =
      tipo === 'peseira'
        ? new RegExp(`^Kit Peseira ?\\+ ?\\d+ Capas.* - ${modelo}$`, 'i')
        : new RegExp(`^Kit Manta ?\\+ ?\\d+ Capas.* - ${modelo}$`, 'i')
    return kits.find((k) => re.test(k.nome))
  }
  // Componente do kit que faz o papel de peseira / capa quadrada. A Baguete
  // é excluída de propósito: ela é sempre de tamanho único e nunca é o que a
  // coluna "KIT 45CM" quer dizer.
  const componenteComPapel = (kit: KitCat, papel: 'peseira' | 'capa') =>
    kit.componentes.find((c) => {
      const nome = porId.get(c.produtoId)?.nome ?? ''
      return papel === 'peseira'
        ? nome.startsWith('Peseira - ')
        : nome.startsWith('Capa de Almofada - ') && !nome.includes('Baguete')
    })

  const avisos: string[] = []
  const linhasProduto = new Map<string, LinhaProduto>()
  const linhasKit = new Map<string, LinhaKit>()
  const conflitos: string[] = []
  const combosIgnorados = new Map<string, number>()
  let semSufixoLinhas = 0
  let semSufixoCelulas = 0

  for (const arquivo of ['RELAÇÃO DE VALORES - PESEIRAS.csv', 'RELAÇÃO DE VALORES - MANTAS.csv']) {
    const [cabecalho, ...corpo] = lerCsv(arquivo)
    for (const linha of corpo) {
      const rotulo = linha[0]!
      const preenchidas = linha.slice(1).filter((c) => paraCentavos(c) !== null).length

      const comSufixo = /^(.*) - (ML|SHOPEE|SHEIN)$/.exec(rotulo)
      if (!comSufixo) {
        // Modelos fora de linha — descarte confirmado pelo usuário.
        semSufixoLinhas++
        semSufixoCelulas += preenchidas
        continue
      }
      const marketplace = MARKETPLACE_DO_SUFIXO[comSufixo[2]!]!

      // "095-ACONCHEGO - CAPA 50" → base "095-ACONCHEGO", capa fixada em 50x50.
      const comCapa = /^(.*) - CAPA (45|50|60)$/.exec(comSufixo[1]!)
      const base = comCapa ? comCapa[1]! : comSufixo[1]!
      const capaDoRotulo = comCapa ? `${comCapa[2]}x${comCapa[2]}` : null

      const modelo = MODELO_DA_PLANILHA[base]
      if (!modelo || !modelos.has(modelo)) {
        avisos.push(
          `SEM MODELO NO CADASTRO — "${base}" (linha "${rotulo}", ${preenchidas} células). Nada criado.`,
        )
        continue
      }

      for (let i = 1; i < linha.length; i++) {
        const nomeCol = cabecalho![i]!
        const centavos = paraCentavos(linha[i]!)
        if (centavos === null) continue
        const origem = `${rotulo} / ${nomeCol}`

        const col = COLUNAS[nomeCol]
        if (!col) {
          avisos.push(`COLUNA DESCONHECIDA — "${nomeCol}" em ${rotulo}`)
          continue
        }
        if (col.tipo === 'combo') {
          combosIgnorados.set(nomeCol, (combosIgnorados.get(nomeCol) ?? 0) + 1)
          continue
        }

        if (col.tipo === 'produto') {
          const nome = `${col.prefixo} - ${modelo}`
          const p = porNome.get(nome.toLowerCase())
          if (!p) {
            avisos.push(`PRODUTO INEXISTENTE — "${nome}" (${origem}) = R$ ${reais(centavos)}`)
            continue
          }
          if (!p.tamanhos.includes(col.tamanho)) {
            avisos.push(
              `TAMANHO INEXISTENTE — "${nome}" não tem ${col.tamanho} (${origem}) = R$ ${reais(centavos)}`,
            )
            continue
          }
          const k = `${p.nome}||${col.tamanho}||${marketplace}`
          const anterior = linhasProduto.get(k)
          if (anterior && anterior.centavos !== centavos) {
            conflitos.push(
              `${k}: R$ ${reais(anterior.centavos)} (${anterior.origem}) vs R$ ${reais(centavos)} (${origem})`,
            )
            continue
          }
          linhasProduto.set(k, {
            produto: p.nome,
            tamanho: col.tamanho,
            marketplace,
            centavos,
            origem,
          })
          continue
        }

        // ── kit ──
        const kit = acharKit(col.kit, modelo)
        if (!kit) {
          avisos.push(
            `KIT INEXISTENTE — Kit de ${col.kit} do modelo ${modelo} (${origem}) = R$ ${reais(centavos)}`,
          )
          continue
        }

        // Tamanhos que a planilha fixa: o da coluna + o do rótulo, quando a
        // linha é uma das "ACONCHEGO - CAPA nn".
        const fixados: { papel: 'peseira' | 'capa'; tamanho: string }[] = [
          { papel: col.papel, tamanho: col.tamanho },
        ]
        if (capaDoRotulo && col.papel !== 'capa') {
          fixados.push({ papel: 'capa', tamanho: capaDoRotulo })
        }

        // Traduz papel → produto real e confere que o tamanho existe nele.
        const escolhasPorProduto: Record<string, string> = {}
        let invalido = false
        for (const f of fixados) {
          const comp = componenteComPapel(kit, f.papel)
          if (!comp) {
            avisos.push(
              `KIT SEM COMPONENTE — "${kit.nome}" não tem ${f.papel} (${origem}) = R$ ${reais(centavos)}`,
            )
            invalido = true
            break
          }
          const prod = porId.get(comp.produtoId)!
          if (!prod.tamanhos.includes(f.tamanho)) {
            avisos.push(
              `TAMANHO FORA DO COMPONENTE — "${prod.nome}" não tem ${f.tamanho} (${origem}) = R$ ${reais(centavos)}`,
            )
            invalido = true
            break
          }
          escolhasPorProduto[comp.produtoId] = f.tamanho
        }
        if (invalido) continue

        // A CHAVE sai da MESMA função que o pedido usa. Se ela devolver null,
        // é porque sobrou componente variável sem tamanho definido pela
        // planilha — gravar assim daria preço inalcançável.
        const combinacao = chaveDeTamanhos(kit.componentes, escolhasPorProduto, tamanhosDe)
        if (combinacao === null) {
          const faltando = kit.componentes
            .filter((c) => tamanhosDe(c.produtoId).length > 1 && !escolhasPorProduto[c.produtoId])
            .map((c) => porId.get(c.produtoId)?.nome ?? c.produtoId)
          avisos.push(
            `COMBINAÇÃO INCOMPLETA — "${kit.nome}" (${origem}): a planilha não diz o tamanho de ${faltando.join(', ')}.`,
          )
          continue
        }

        // Só componente VARIÁVEL vai pras escolhas do SQL: os fixos não
        // entram na chave (seriam iguais em toda linha).
        const escolhasSql = Object.entries(escolhasPorProduto)
          .filter(([produtoId]) => tamanhosDe(produtoId).length > 1)
          .map(([produtoId, t]) => `${porId.get(produtoId)!.nome}=${t}`)
          .sort()

        const k = `${kit.nome}||${combinacao}||${marketplace}`
        const anterior = linhasKit.get(k)
        if (anterior && anterior.centavos !== centavos) {
          conflitos.push(
            `${k}: R$ ${reais(anterior.centavos)} (${anterior.origem}) vs R$ ${reais(centavos)} (${origem})`,
          )
          continue
        }
        linhasKit.set(k, {
          kitNome: kit.nome,
          escolhas: escolhasSql,
          combinacao,
          marketplace,
          centavos,
          origem,
        })
      }
    }
  }

  // ── Relatório ──────────────────────────────────────────────────────
  const nProd = linhasProduto.size
  const nKit = linhasKit.size
  const nKitDuplo = [...linhasKit.values()].filter((l) => l.escolhas.length > 1).length
  const combos = [...combosIgnorados.values()].reduce((a, b) => a + b, 0)

  console.log('════════ ENTRAM ════════')
  console.log('  produto × tamanho × marketplace :', nProd)
  console.log('  kit × combinação × marketplace  :', nKit, `(${nKitDuplo} com dois tamanhos)`)
  console.log('  TOTAL                           :', nProd + nKit)
  console.log('\n════════ FICAM DE FORA ════════')
  console.log(`  combos 2/3/4 CAPAS              : ${combos} células`)
  for (const [c, n] of [...combosIgnorados].sort()) console.log(`      ${c.padEnd(9)} ${n}`)
  console.log(
    `  linhas sem sufixo de marketplace: ${semSufixoLinhas} linhas, ${semSufixoCelulas} células`,
  )
  console.log(`\n  avisos (${new Set(avisos).size}):`)
  for (const a of [...new Set(avisos)]) console.log('    • ' + a)
  if (conflitos.length) {
    console.log('\n  !!! CONFLITOS (mesma chave, valores diferentes) !!!')
    for (const c of conflitos) console.log('    ✗ ' + c)
  } else {
    console.log('\n  conflitos de valor: NENHUM')
  }

  // ── SQL ────────────────────────────────────────────────────────────
  const cab = (s: string) =>
    s
      .split('\n')
      .map((l) => `-- ${l}`.trimEnd())
      .join('\n')

  const sqlProduto = [...linhasProduto.values()]
    .sort((a, b) =>
      `${a.produto}${a.tamanho}${a.marketplace}`.localeCompare(
        `${b.produto}${b.tamanho}${b.marketplace}`,
      ),
    )
    .map(
      (l, i) =>
        `  (${i === 0 ? `'${l.produto}'::text` : `'${l.produto}'`}, ` +
        `${i === 0 ? `'${l.tamanho}'::text` : `'${l.tamanho}'`}, ` +
        `${i === 0 ? `'${l.marketplace}'::text` : `'${l.marketplace}'`}, ` +
        `${i === 0 ? `${reais(l.centavos)}::numeric(12,2)` : reais(l.centavos)})`,
    )
    .join(',\n')

  const sqlKit = [...linhasKit.values()]
    .sort((a, b) =>
      `${a.kitNome}${a.combinacao}${a.marketplace}`.localeCompare(
        `${b.kitNome}${b.combinacao}${b.marketplace}`,
      ),
    )
    .map((l, i) => {
      const arr = `ARRAY[${l.escolhas.map((e) => `'${e}'`).join(', ')}]${
        l.escolhas.length === 0 ? '::text[]' : i === 0 ? '::text[]' : ''
      }`
      return (
        `  (${i === 0 ? `'${l.kitNome}'::text` : `'${l.kitNome}'`}, ${arr}, ` +
        `${i === 0 ? `'${l.marketplace}'::text` : `'${l.marketplace}'`}, ` +
        `${i === 0 ? `${reais(l.centavos)}::numeric(12,2)` : reais(l.centavos)})`
      )
    })
    .join(',\n')

  const relatorio = [
    `${nProd} linhas de produto e ${nKit} de kit (${nKitDuplo} com combinação de DOIS`,
    `tamanhos, todas do Kit Peseira+2 Capas ACONCHEGO). Total ${nProd + nKit}.`,
    '',
    'NÃO ENTRARAM, e é de propósito:',
    `  • ${combos} células dos combos 2/3/4 CAPAS — vendidos como anúncio, não`,
    '    existem como kit no catálogo. Nenhum kit foi criado pra acomodá-los.',
    `  • ${semSufixoCelulas} células nas ${semSufixoLinhas} linhas sem sufixo de marketplace —`,
    '    modelos fora de linha, descarte confirmado pelo usuário.',
    ...[...new Set(avisos)].map((a) => `  • ${a}`),
  ].join('\n')

  const conteudo = `-- ============================================================
-- 48_preco_marketplace_carga.sql
-- Carga do preço de MARKETPLACE, tirada das duas planilhas do cliente
-- ("RELAÇÃO DE VALORES - PESEIRAS/MANTAS").
--
-- ⚠️ ESTE PREÇO NÃO ALIMENTA PEDIDO. O pedido puxa o de ATACADO
-- (produto_tamanho_preco / kit_tamanho_preco). A regra inteira, com o porquê,
-- está no topo de src/lib/preco-marketplace.ts.
--
-- GERADO por scripts/analise/gerar-carga-marketplace.ts — não edite à mão;
-- corrija a planilha ou o script e rode de novo. O script confere cada célula
-- contra o catálogo e recusa o que não casa, em vez de criar cadastro.
--
${cab(relatorio)}
--
-- ON CONFLICT DO NOTHING, e não UPSERT: este arquivo roda em todo
-- \`npm run db:setup\`. Se sobrescrevesse, um preço ajustado na tela voltaria
-- pro valor da planilha no próximo setup, em silêncio. Aqui a carga só
-- preenche buraco — mesmo padrão do 39_precos_carga.sql.
--
-- IDs resolvidos por NOME, sem UUID escrito à mão: UUID em arquivo versionado
-- quebra em qualquer outro banco e não dá pra conferir a olho. O JOIN também
-- é rede de segurança — nome que não casa simplesmente não insere.
--
-- Idempotente. Só INSERT.
-- ============================================================

INSERT INTO public.produto_tamanho_preco_marketplace
  (produto_id, tamanho_id, marketplace, preco)
SELECT p.id, t.id, v.marketplace, v.preco
FROM (VALUES
${sqlProduto}
) AS v(produto, tamanho, marketplace, preco)
JOIN public.produtos p ON p.nome = v.produto AND p.deleted_at IS NULL
JOIN public.tamanhos t ON t.nome = v.tamanho AND t.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------
-- KITS — a \`combinacao\` é MONTADA AQUI, não escrita literal.
--
-- Ela contém produto_id (uuid), que muda de banco pra banco. Então a planilha
-- entra como pares "Nome do Produto=Tamanho" dos componentes VARIÁVEIS, e o
-- LATERAL abaixo reproduz exatamente \`chaveDeTamanhos\`
-- (src/lib/kit-tamanhos.ts): pares \`<produtoId>=<tamanho minúsculo>\`
-- ordenados por produto_id, unidos por '|'.
--
-- A ordenação bate com a do TypeScript porque lá os pares são ordenados como
-- STRING e todo par começa pelo produto_id — e a ordem de bytes de um uuid é
-- a mesma da representação hexadecimal minúscula dele.
--
-- \`ARRAY[]\` vazio é o kit SEM componente variável: combinação '' , que é
-- chave válida ("este kit tem um preço só").
--
-- \`c.casados = cardinality(v.escolhas)\` é a rede: se algum nome de produto
-- não casar com um componente do kit, a linha não insere, em vez de gravar
-- uma combinação truncada que ninguém acharia depois.
-- --------------------------------------------------------------

INSERT INTO public.kit_tamanho_preco_marketplace
  (kit_id, combinacao, marketplace, preco)
SELECT k.id, c.combinacao, v.marketplace, v.preco
FROM (VALUES
${sqlKit}
) AS v(kit_nome, escolhas, marketplace, preco)
JOIN public.kits k ON k.nome = v.kit_nome AND k.deleted_at IS NULL
JOIN LATERAL (
  SELECT
    COALESCE(
      string_agg(ki.produto_id::text || '=' || lower(split_part(e, '=', 2)), '|'
                 ORDER BY ki.produto_id),
      ''
    ) AS combinacao,
    count(*) AS casados
  FROM unnest(v.escolhas) AS e
  JOIN public.produtos p2
    ON p2.nome = split_part(e, '=', 1) AND p2.deleted_at IS NULL
  JOIN public.kit_itens ki
    ON ki.kit_id = k.id AND ki.produto_id = p2.id
) c ON c.casados = cardinality(v.escolhas)
ON CONFLICT DO NOTHING;
`

  writeFileSync(SAIDA, conteudo, 'utf-8')
  console.log(`\n✅ ${SAIDA} gerado (${nProd + nKit} linhas).`)
}

void main()
