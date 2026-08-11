// Parser do CSV de vendas por conta de marketplace.
// Formato (sem cabeçalho, separador ';', campos entre aspas):
//   "18/06/2026";"Mercado Livre";"Conta 1 - Mercado Livre";"196";"R$15.864,00"
//
// Colunas: data (DD/MM/AAAA) ; marketplace ; conta ("Conta N - ...") ;
//          quantidade ; valor ("R$15.864,00").

import {
  CONTAS_MARKETPLACE,
  MARKETPLACE_LABEL,
  type ContaKey,
  type Marketplace,
} from '@/lib/validators/vendas'

export type ContaImport = {
  conta: ContaKey
  quantidade: number
  faturamento: string // decimal "1234.56"
}

export type DiaImport = {
  data: string // YYYY-MM-DD
  contas: ContaImport[]
  totalQtd: number
  totalFat: number
}

// Os avisos vêm em DUAS listas porque significam coisas opostas, e misturá-las
// faz o diálogo mentir: com uma lista só, o rótulo "linha(s) ignorada(s)"
// passa a valer pra linha que ENTROU.
//
//  - `ignoradas`: a linha não entrou. Dado perdido — o total do arquivo não
//    bate com o que foi importado.
//  - `atencoes`: a linha ENTROU, mas tem algo suspeito. O total bate; o que
//    pode estar errado é a distribuição.
export type ResultadoImport = {
  dias: DiaImport[]
  ignoradas: string[]
  atencoes: string[]
}

const MARKETPLACE_ALIAS: Record<string, Marketplace> = {
  'mercado livre': 'mercado_livre',
  mercadolivre: 'mercado_livre',
  ml: 'mercado_livre',
  shopee: 'shopee',
  shein: 'shein',
  tiktok: 'tiktok',
  'tik tok': 'tiktok',
  'tiktok shop': 'tiktok',
  'tik tok shop': 'tiktok',
  temu: 'temu',
  amazon: 'amazon',
  'vendas atacado': 'vendas_atacado',
  atacado: 'vendas_atacado',
}

function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function marketplaceDoTexto(s: string): Marketplace | null {
  return MARKETPLACE_ALIAS[normalizar(s)] ?? null
}

// "18/06/2026" -> "2026-06-18" (ou null se inválido)
function dataBR(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

// "R$15.864,00" -> "15864.00" (decimal); "" -> null
function valorBR(s: string): string | null {
  const limpo = s.replace(/[^\d,]/g, '') // tira R$, espaços e ponto de milhar
  if (!limpo) return null
  const dec = limpo.replace(',', '.')
  const n = Number(dec)
  return Number.isFinite(n) ? n.toFixed(2) : null
}

// "18/06/2026" de volta, pra mensagem falar a mesma língua do arquivo.
function dataParaBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function moedaBR(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// "linhas 155 e 157" / "linhas 3, 7 e 9"
function listaDeLinhas(ns: number[]): string {
  if (ns.length === 1) return `linha ${ns[0]}`
  return `linhas ${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}`
}

// O marketplace declarado no SUFIXO do nome da conta ("Conta 2 - Shopee").
// Devolve null quando não há sufixo ou quando ele não casa com nenhum
// marketplace conhecido — export sem sufixo é comum e não pode virar ruído.
function marketplaceDoSufixo(contaCsv: string): Marketplace | null {
  const m = contaCsv.match(/-([^-]*)$/)
  if (!m) return null
  return marketplaceDoTexto(m[1])
}

type ResolucaoConta =
  | { conta: ContaKey; alerta: string | null; motivo?: undefined }
  | { conta: null; motivo: string; alerta?: undefined }

// Acha a chave da conta a partir do marketplace + texto "Conta N - ...", e
// diz junto o que há de estranho na linha.
//
// O que denuncia o erro mais comum — a coluna da conta copiada de uma linha
// vizinha — é o SUFIXO do nome da conta discordar da coluna de marketplace.
// Essa discordância cai em dois destinos bem diferentes:
//
//  - a conta NÃO resolve ("Shein / Conta 2 - Shopee": a Shein não tem Conta
//    2) -> vira o motivo da linha ignorada, no lugar de um "conta não
//    reconhecida" que não diz onde olhar;
//  - a conta RESOLVE assim mesmo ("Mercado Livre / Conta 1 - Shopee": o ML
//    tem Conta 1) -> vira ALERTA. A venda entra, e entra numa conta
//    plausível: sem o aviso, esse é o caso que ninguém percebe.
function resolverConta(
  marketplaceCsv: string,
  contaCsv: string,
): ResolucaoConta {
  const mk = marketplaceDoTexto(marketplaceCsv)
  const generico = `conta não reconhecida: "${marketplaceCsv} / ${contaCsv}"`
  if (!mk) return { conta: null, motivo: generico }

  const doSufixo = marketplaceDoSufixo(contaCsv)
  const discorda =
    doSufixo && doSufixo !== mk
      ? `a conta diz ${MARKETPLACE_LABEL[doSufixo]} mas o marketplace da ` +
        `linha é ${MARKETPLACE_LABEL[mk]}`
      : null

  const aceita = (conta: ContaKey): ResolucaoConta => ({
    conta,
    alerta: discorda ? `${discorda} — entrou em ${rotuloConta(conta)}` : null,
  })

  const candidatos = CONTAS_MARKETPLACE.filter((c) => c.marketplace === mk)
  // Marketplaces de conta única (tiktok/temu): casa direto.
  if (candidatos.length === 1) return aceita(candidatos[0].key)
  if (candidatos.length > 1) {
    const m = normalizar(contaCsv).match(/conta\s*(\d+)/)
    if (m) {
      const alvo = `conta ${m[1]}`
      const found = candidatos.find((c) => normalizar(c.label) === alvo)
      if (found) return aceita(found.key)
    }
  }

  return {
    conta: null,
    motivo: discorda
      ? `${discorda} ("${marketplaceCsv} / ${contaCsv}")`
      : generico,
  }
}

// Divide uma linha CSV por ';' e tira as aspas.
function camposDaLinha(linha: string): string[] {
  return linha.split(';').map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())
}

export function parseVendasCSV(texto: string): ResultadoImport {
  const ignoradas: string[] = []
  const atencoes: string[] = []

  // Guarda as LINHAS de origem junto do acumulado — é o que permite dizer
  // depois onde olhar quando a mesma (data, conta) aparece mais de uma vez.
  type Acumulado = { q: number; f: number; linhas: number[] }
  // mapa: data -> conta -> acumulado
  const porDia = new Map<string, Map<ContaKey, Acumulado>>()

  // Numeração pelo índice FÍSICO do arquivo: filtrar as vazias antes de
  // numerar deslocaria as mensagens e mandaria o usuário pra linha errada,
  // que é o oposto do que elas servem.
  let primeiraComConteudo = true

  texto.split(/\r?\n/).forEach((bruta, idx) => {
    const linha = bruta.trim()
    if (!linha) return
    const numero = idx + 1
    const ehPrimeira = primeiraComConteudo
    primeiraComConteudo = false

    const campos = camposDaLinha(linha)
    if (campos.length < 5) {
      ignoradas.push(`Linha ${numero}: colunas insuficientes.`)
      return
    }
    const [dataCsv, mkCsv, contaCsv, qtdCsv, valorCsv] = campos

    const data = dataBR(dataCsv)
    if (!data) {
      // Provável cabeçalho na 1ª linha com conteúdo: ignora em silêncio.
      if (ehPrimeira) return
      ignoradas.push(`Linha ${numero}: data inválida ("${dataCsv}").`)
      return
    }

    const { conta, motivo, alerta } = resolverConta(mkCsv, contaCsv)
    if (!conta) {
      ignoradas.push(`Linha ${numero}: ${motivo}.`)
      return
    }
    if (alerta) atencoes.push(`Linha ${numero}: ${alerta}.`)

    const quantidade = Number(qtdCsv.replace(/\D/g, '')) || 0
    const fatStr = valorBR(valorCsv)
    const faturamento = fatStr ? Number(fatStr) : 0

    if (!porDia.has(data)) porDia.set(data, new Map())
    const contas = porDia.get(data)!
    const atual = contas.get(conta) ?? { q: 0, f: 0, linhas: [] }
    atual.q += quantidade
    atual.f += faturamento
    atual.linhas.push(numero)
    contas.set(conta, atual)
  })

  const ordenados = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))

  // Mesma (data, conta) em 2+ linhas. SOMAR é o certo — duas exportações
  // parciais do mesmo dia são legítimas —, mas somar em silêncio esconde o
  // erro de digitação na coluna da conta: o total do DIA continua batendo, e
  // só a distribuição entre contas fica errada. Daí ser ATENÇÃO, não ignorada.
  for (const [data, contasMap] of ordenados) {
    for (const [conta, v] of contasMap) {
      if (v.linhas.length < 2) continue
      atencoes.push(
        `${rotuloConta(conta)} aparece ${v.linhas.length}× em ` +
          `${dataParaBR(data)} (${listaDeLinhas(v.linhas)}): somadas, ` +
          `${v.q} vendas e ${moedaBR(v.f)}.`,
      )
    }
  }

  const dias: DiaImport[] = ordenados.map(([data, contasMap]) => {
    const contas: ContaImport[] = [...contasMap.entries()].map(
      ([conta, v]) => ({
        conta,
        quantidade: v.q,
        faturamento: v.f.toFixed(2),
      }),
    )
    return {
      data,
      contas,
      totalQtd: contas.reduce((s, c) => s + c.quantidade, 0),
      totalFat: contas.reduce((s, c) => s + Number(c.faturamento), 0),
    }
  })

  return { dias, ignoradas, atencoes }
}

// Label amigável de uma conta (pra preview).
export function rotuloConta(conta: ContaKey): string {
  const c = CONTAS_MARKETPLACE.find((x) => x.key === conta)
  if (!c) return conta
  const mk = MARKETPLACE_LABEL[c.marketplace]
  // Marketplace de conta única tem label igual ao do marketplace, e "Temu ·
  // Temu" não informa nada a mais.
  return c.label === mk ? mk : `${mk} · ${c.label}`
}
