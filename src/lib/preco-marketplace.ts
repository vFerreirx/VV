// ════════════════════════════════════════════════════════════════
// PREÇO DE MARKETPLACE — e a única regra que importa sobre ele:
//
//        ISTO NÃO É O PREÇO DO PEDIDO. O PEDIDO SEMPRE PUXA O DE ATACADO.
//
// ════════════════════════════════════════════════════════════════
//
// São duas tabelas de preço no sistema, e elas parecem GÊMEAS:
//
//   ATACADO      produto_tamanho_preco / kit_tamanho_preco      (migration 38/47)
//                → src/lib/preco.ts, `obterCatalogoDePrecos`
//                → é o que preenche o preço unitário do pedido
//
//   MARKETPLACE  *_preco_marketplace                            (migration 47)
//                → este arquivo
//                → é o preço do ANÚNCIO, pra conferir Shopee/ML/Shein
//
// Mesmas colunas, mesmos tipos, nomes quase iguais, os dois em centavos, os
// dois por (dono, tamanho). Um dia alguém vai precisar de "o preço" numa tela
// nova, vai achar este módulo primeiro porque o nome é mais específico, e vai
// ligar o errado. É pra esse dia que este comentário existe.
//
// POR QUE NÃO PODE: o preço de marketplace já embute comissão da plataforma,
// frete grátis e imposto do varejo. A Peseira ACONCHEGO Casal é 50,00 no
// atacado e 79,99 no Mercado Livre. Colocar 79,99 num pedido de atacado
// cobraria 60% a mais do lojista sem ninguém notar — o campo do pedido é
// editável e um preço "quase plausível" passa na conferência.
//
// O QUE ISSO PROÍBE, na prática:
//   - nada em src/app/(app)/pedidos/ importa deste arquivo;
//   - `obterCatalogoDePrecos` não ganha parâmetro de marketplace;
//   - `TabelaDePrecos` (src/lib/preco.ts) não ganha um terceiro mapa.
// Se alguma dessas três coisas acontecer, o errado já foi ligado.
//
// O que este módulo TEM em comum com o de atacado, e de propósito: a
// conversão de centavos e a CHAVE. `chave` e `chaveKit` vêm de
// src/lib/preco.ts em vez de serem recriadas aqui, e a combinação de
// tamanhos do kit é a mesma `chaveDeTamanhos` de src/lib/kit-tamanhos.ts.
// Chave diferente entre as duas faria um preço cadastrado virar inalcançável
// — exatamente o defeito que o AGENTS.md descreve.

// Relativo com `.ts` pelo mesmo motivo de src/lib/preco.ts: as regras daqui
// têm teste no runner do Node.
import { chave, chaveKit } from './preco.ts'
import type { Marketplace } from './validators/vendas.ts'

/**
 * Canais que TÊM tabela de preço de marketplace.
 *
 * `vendas_atacado` existe em `MARKETPLACE_LABEL` mas fica de fora daqui (e do
 * CHECK no banco): "preço de marketplace do canal atacado" é a confusão que
 * o topo deste arquivo manda evitar. Atacado tem tabela própria.
 */
export const CANAIS_COM_PRECO = [
  'mercado_livre',
  'shopee',
  'shein',
  'tiktok',
  'temu',
  'amazon',
] as const satisfies ReadonlyArray<Marketplace>

export type CanalComPreco = (typeof CANAIS_COM_PRECO)[number]

export function ehCanalComPreco(v: string): v is CanalComPreco {
  return (CANAIS_COM_PRECO as readonly string[]).includes(v)
}

/**
 * Preços de anúncio, indexados por canal.
 *
 * Deliberadamente NÃO é o mesmo tipo que `TabelaDePrecos` de src/lib/preco.ts,
 * mesmo tendo a mesma forma por dentro. Tipos distintos são o que faz o
 * TypeScript recusar `precoDeKit(tabelaDeMarketplace, ...)` — se os dois
 * fossem `TabelaDePrecos`, trocar um pelo outro compilaria em silêncio.
 */
export type TabelaMarketplace = {
  // Chave: `${produtoId}|${tamanhoNomeLower}` — a mesma `chave()` do atacado.
  produto: Record<string, number>
  // Chave: `${kitId}|${combinacao}` — a mesma `chaveKit()` do atacado.
  kit: Record<string, number>
}

export type PrecosPorCanal = Partial<Record<CanalComPreco, TabelaMarketplace>>

export const tabelaMarketplaceVazia = (): TabelaMarketplace => ({
  produto: {},
  kit: {},
})

/** Preço de anúncio de um produto num canal. Nulo = não cadastrado. */
export function precoMarketplaceDeProduto(
  porCanal: PrecosPorCanal,
  canal: CanalComPreco,
  produtoId: string,
  tamanho: string | null | undefined,
): number | null {
  return porCanal[canal]?.produto[chave(produtoId, tamanho)] ?? null
}

/**
 * Preço de anúncio de um kit num canal, na combinação de tamanhos.
 *
 * NÃO cai na soma dos componentes quando falta, ao contrário do atacado
 * (`precoDeKit`): o anúncio do kit é um preço próprio, negociado pra
 * competir na plataforma, e somar os anúncios das peças daria um número que
 * ninguém nunca cobrou. Faltando, falta — e a tela mostra a célula vazia.
 */
export function precoMarketplaceDeKit(
  porCanal: PrecosPorCanal,
  canal: CanalComPreco,
  kitId: string,
  combinacao: string | null | undefined,
): number | null {
  if (combinacao == null) return null
  return porCanal[canal]?.kit[chaveKit(kitId, combinacao)] ?? null
}

// -----------------------------------------------------------------
// O ANÚNCIO FICOU ABAIXO DO ATACADO?
// -----------------------------------------------------------------
//
// ⚠️ É O DEFEITO QUE CUSTA DINHEIRO, e ele aconteceu: a Manta 3D está
// anunciada a R$ 54,99 nos cinco canais contra R$ 59,99 de atacado. Quer
// dizer que o LOJISTA paga mais caro que o consumidor final — e do anúncio
// ainda sai a comissão da plataforma, o frete e o imposto do varejo. O número
// "quase certo" passa despercebido: 54,99 parece um preço de anúncio normal.
//
// A tela não tinha como perceber porque as duas tabelas nunca se olhavam.
// Continuam separadas (é o requisito do topo deste arquivo): o que passa a
// existir é a COMPARAÇÃO, que não mistura nada — lê as duas e responde uma
// pergunta.

export type EstadoVsAtacado = 'abaixo' | 'igual' | 'ok'

/**
 * Como este anúncio se compara ao preço de atacado do mesmo par.
 *
 * `null` = não há atacado cadastrado pra comparar. Nunca 'ok': dizer que está
 * ok sem ter com o que comparar é inventar tranquilidade.
 *
 * ⚠️ EM CENTAVOS INTEIROS, como o resto do módulo. Comparar decimal em texto
 * ou em float faz 54.99 e 54.990000000001 discordarem, e a comparação erraria
 * justamente no empate — que é o caso que mais importa aqui.
 */
export function comparadoAoAtacado(
  anuncioCentavos: number | null | undefined,
  atacadoCentavos: number | null | undefined,
): EstadoVsAtacado | null {
  if (anuncioCentavos == null || atacadoCentavos == null) return null
  if (anuncioCentavos < atacadoCentavos) return 'abaixo'
  if (anuncioCentavos === atacadoCentavos) return 'igual'
  return 'ok'
}

// -----------------------------------------------------------------
// Os canais dizem todos a mesma coisa?
// -----------------------------------------------------------------

export type ResumoDosCanais = {
  /** Quantos canais têm preço cadastrado nesta linha. */
  canaisComPreco: number
  /** Todos os que têm preço têm o MESMO valor. */
  todosIguais: boolean
  /** O valor comum, quando todos são iguais. Null quando divergem. */
  valor: number | null
}

/**
 * Resume a linha pra tela poder destacar o que DIFERE.
 *
 * Hoje as cinco colunas repetem o mesmo número (as cargas 62–67 semearam
 * todos a partir da Shopee), e a diferença de um canal — quando existe — se
 * esconde no meio de quatro repetições. Saber que "todos dizem a mesma coisa"
 * é o que permite marcar a exceção em vez de marcar tudo.
 *
 * Canal sem preço não conta: ele não concorda nem discorda de ninguém.
 */
export function resumoDosCanais(
  precos: Partial<Record<CanalComPreco, number | null | undefined>>,
): ResumoDosCanais {
  const valores: number[] = []
  for (const canal of CANAIS_COM_PRECO) {
    const v = precos[canal]
    if (v != null) valores.push(v)
  }
  if (valores.length === 0) {
    return { canaisComPreco: 0, todosIguais: false, valor: null }
  }
  const primeiro = valores[0]!
  const todosIguais = valores.every((v) => v === primeiro)
  return {
    canaisComPreco: valores.length,
    todosIguais,
    valor: todosIguais ? primeiro : null,
  }
}
