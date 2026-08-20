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

import { chave, chaveKit } from '@/lib/preco'
import type { Marketplace } from '@/lib/validators/vendas'

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
