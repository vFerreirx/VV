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

export type ResultadoImport = {
  dias: DiaImport[]
  avisos: string[]
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

// Acha a chave da conta a partir do marketplace + texto "Conta N - ...".
function acharConta(marketplaceCsv: string, contaCsv: string): ContaKey | null {
  const mk = marketplaceDoTexto(marketplaceCsv)
  if (!mk) return null
  const candidatos = CONTAS_MARKETPLACE.filter((c) => c.marketplace === mk)
  if (candidatos.length === 0) return null
  // Marketplaces de conta única (tiktok/temu): casa direto.
  if (candidatos.length === 1) return candidatos[0].key
  const m = normalizar(contaCsv).match(/conta\s*(\d+)/)
  if (m) {
    const alvo = `conta ${m[1]}`
    const found = candidatos.find((c) => normalizar(c.label) === alvo)
    if (found) return found.key
  }
  return null
}

// Divide uma linha CSV por ';' e tira as aspas.
function camposDaLinha(linha: string): string[] {
  return linha.split(';').map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())
}

export function parseVendasCSV(texto: string): ResultadoImport {
  const avisos: string[] = []
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  // mapa: data -> conta -> { q, f }
  const porDia = new Map<string, Map<ContaKey, { q: number; f: number }>>()

  linhas.forEach((linha, i) => {
    const campos = camposDaLinha(linha)
    if (campos.length < 5) {
      avisos.push(`Linha ${i + 1} ignorada (colunas insuficientes).`)
      return
    }
    const [dataCsv, mkCsv, contaCsv, qtdCsv, valorCsv] = campos

    const data = dataBR(dataCsv)
    if (!data) {
      // Provável cabeçalho na 1ª linha: ignora em silêncio.
      if (i === 0) return
      avisos.push(`Linha ${i + 1} ignorada (data inválida: "${dataCsv}").`)
      return
    }

    const conta = acharConta(mkCsv, contaCsv)
    if (!conta) {
      avisos.push(
        `Linha ${i + 1} ignorada (conta não reconhecida: "${mkCsv} / ${contaCsv}").`,
      )
      return
    }

    const quantidade = Number(qtdCsv.replace(/\D/g, '')) || 0
    const fatStr = valorBR(valorCsv)
    const faturamento = fatStr ? Number(fatStr) : 0

    if (!porDia.has(data)) porDia.set(data, new Map())
    const contas = porDia.get(data)!
    const atual = contas.get(conta) ?? { q: 0, f: 0 }
    atual.q += quantidade
    atual.f += faturamento
    contas.set(conta, atual)
  })

  const dias: DiaImport[] = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, contasMap]) => {
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

  return { dias, avisos }
}

// Label amigável de uma conta (pra preview).
export function rotuloConta(conta: ContaKey): string {
  const c = CONTAS_MARKETPLACE.find((x) => x.key === conta)
  if (!c) return conta
  return `${MARKETPLACE_LABEL[c.marketplace]} · ${c.label}`
}
