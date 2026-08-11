// A única parte do sistema que fala com o Melhor Envio. Pequena de propósito:
// tudo que é decisão (dividir em pacotes, ratear valor declarado, montar o
// corpo) vive em src/lib/frete.ts, que é puro e dá pra conferir sem token.
//
// SERVER-ONLY. O token é credencial de conta e não pode encostar no browser —
// este módulo só é importado por Server Action. Não há `'use client'` em
// nenhum arquivo que chegue aqui, e não pode passar a haver.
//
// ESCOPO: este código só COTA (`POST /api/v2/me/shipment/calculate`). O token
// pode ter permissão de comprar etiqueta; nada aqui gera, paga ou compra
// envio, e isso é deliberado — não acrescente sem decidir explicitamente.

import type { CorpoCotacao } from './frete'

const TIMEOUT_MS = 12_000

export type ConfigMelhorEnvio = {
  token: string
  baseUrl: string
  userAgent: string
}

/**
 * Lê as credenciais do ambiente. Devolve `null` quando não está configurado —
 * o chamador desabilita o botão com explicação em vez de estourar erro.
 *
 * SANDBOX é o padrão. Pra ir a produção, troque no `.env.local`:
 *   MELHOR_ENVIO_URL="https://melhorenvio.com.br"
 * e o token pelo de produção — são credenciais diferentes, o token de
 * sandbox não autentica em produção.
 */
export function configMelhorEnvio(): ConfigMelhorEnvio | null {
  const token = process.env.MELHOR_ENVIO_TOKEN?.trim()
  if (!token) return null
  const baseUrl = (
    process.env.MELHOR_ENVIO_URL?.trim() || 'https://sandbox.melhorenvio.com.br'
  ).replace(/\/+$/, '')
  // A doc pede nome da aplicação e e-mail técnico no User-Agent, pra eles
  // conseguirem falar com quem está chamando quando algo sai do lugar.
  const userAgent =
    process.env.MELHOR_ENVIO_USER_AGENT?.trim() || 'Vanvest ERP (sem-contato)'
  return { token, baseUrl, userAgent }
}

export function ehSandbox(config: ConfigMelhorEnvio): boolean {
  return config.baseUrl.includes('sandbox')
}

export type ServicoCotado = {
  id: number
  servico: string
  transportadora: string
  /** Em CENTAVOS inteiros, como todo dinheiro no sistema. */
  precoCentavos: number
  prazoDias: number | null
}

/** Serviço que a API devolveu junto dos válidos, mas com erro próprio. */
export type ServicoComErro = {
  servico: string
  transportadora: string
  erro: string
}

export type ResultadoCotacao =
  | { ok: true; servicos: ServicoCotado[]; comErro: ServicoComErro[] }
  | { ok: false; erro: string }

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** "37.79" | 37.79 -> 3779 centavos. */
function paraCentavos(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(texto(v) ?? NaN)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function paraInteiro(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(texto(v) ?? NaN)
  return Number.isFinite(n) ? Math.round(n) : null
}

/**
 * A resposta é um array em que cada posição é uma transportadora/serviço, e
 * uma posição pode vir com `error` no lugar do preço — normalmente porque
 * aquele serviço não atende o CEP ou não aceita as medidas. Isso NÃO é falha
 * da cotação: os que deram certo continuam valendo, e os que não deram são
 * devolvidos à parte pra tela mostrar em vez de esconder.
 */
function interpretar(json: unknown): ResultadoCotacao {
  if (!Array.isArray(json)) {
    return { ok: false, erro: 'O Melhor Envio devolveu uma resposta inesperada.' }
  }

  const servicos: ServicoCotado[] = []
  const comErro: ServicoComErro[] = []

  for (const bruto of json) {
    if (!bruto || typeof bruto !== 'object') continue
    const s = bruto as Record<string, unknown>
    const empresa = s.company as Record<string, unknown> | undefined
    const transportadora = texto(empresa?.name) ?? '—'
    const servico = texto(s.name) ?? '—'

    const erro = texto(s.error)
    if (erro) {
      comErro.push({ servico, transportadora, erro })
      continue
    }

    // `custom_price`/`custom_delivery_time` refletem as customizações da
    // conta (markup ou desconto negociado) e é o que a doc manda usar em
    // produção; os campos base ficam de reserva.
    const precoCentavos =
      paraCentavos(s.custom_price) ?? paraCentavos(s.price) ?? null
    if (precoCentavos == null) {
      comErro.push({ servico, transportadora, erro: 'Veio sem preço.' })
      continue
    }

    servicos.push({
      id: paraInteiro(s.id) ?? 0,
      servico,
      transportadora,
      precoCentavos,
      prazoDias:
        paraInteiro(s.custom_delivery_time) ?? paraInteiro(s.delivery_time),
    })
  }

  if (servicos.length === 0 && comErro.length === 0) {
    return {
      ok: false,
      erro: 'Nenhuma transportadora respondeu pra esse trajeto.',
    }
  }
  return { ok: true, servicos, comErro }
}

export async function cotarFrete(
  corpo: CorpoCotacao,
  config: ConfigMelhorEnvio,
): Promise<ResultadoCotacao> {
  let res: Response
  try {
    res = await fetch(`${config.baseUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        'User-Agent': config.userAgent,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    // Timeout, DNS, sem internet — tudo cai aqui, e nenhum deles é culpa do
    // pedido. A mensagem tem que dizer isso pra ninguém sair conferindo o
    // cadastro à toa.
    return {
      ok: false,
      erro: 'O Melhor Envio não respondeu a tempo. Tente de novo em instantes — nada do pedido foi alterado.',
    }
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      erro: `Token do Melhor Envio inválido ou expirado (HTTP ${res.status}). Gere um novo e atualize MELHOR_ENVIO_TOKEN.`,
    }
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    return {
      ok: false,
      erro: `O Melhor Envio devolveu uma resposta ilegível (HTTP ${res.status}).`,
    }
  }

  if (!res.ok) {
    // 422 vem com { message, errors: { campo: [mensagens] } } — a mensagem
    // de campo é bem mais útil que "erro ao cotar".
    const corpoErro = (json ?? {}) as Record<string, unknown>
    const porCampo = corpoErro.errors as Record<string, unknown> | undefined
    const detalhe = porCampo
      ? Object.values(porCampo)
          .flatMap((v) => (Array.isArray(v) ? v.map(String) : [String(v)]))
          .slice(0, 3)
          .join(' ')
      : null
    return {
      ok: false,
      erro:
        detalhe ||
        texto(corpoErro.message) ||
        `O Melhor Envio recusou a cotação (HTTP ${res.status}).`,
    }
  }

  return interpretar(json)
}
