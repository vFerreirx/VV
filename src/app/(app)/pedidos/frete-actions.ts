'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { obterCatalogoDePesos, obterOrcamento } from './actions'
import { listarFaixasParaCalculo } from '../faixas-embalagem/actions'
import { obterOrigemFrete } from '../empresas/actions'
import { requireArea, requireAreaEscrita } from '@/lib/auth/require-auth'
import { db } from '@/lib/db'
import { compradores, orcamentos } from '@/lib/db/schema'
import {
  formatarMedidas,
  montarCotacao,
  soDigitosCep,
  valorDeclaradoCentavos,
  type Pacote,
} from '@/lib/frete'
import {
  configMelhorEnvio,
  cotarFrete,
  ehSandbox,
  type ServicoComErro,
  type ServicoCotado,
} from '@/lib/melhor-envio'
import { calcularPesos } from '@/lib/peso'

export type ActionResult<T = undefined> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: string }

/**
 * O que a tela precisa saber ANTES de alguém clicar: dá pra cotar, e se não
 * dá, por quê. Cada impedimento vira uma frase acionável — "falta X" leva a
 * cadastrar X, "erro ao cotar" não leva a lugar nenhum.
 */
export type SituacaoFrete = {
  podeCotar: boolean
  impedimentos: string[]
  sandbox: boolean
  origem: { cep: string; cidade: string | null; uf: string | null } | null
  capacidadeGramas: number
}

export async function obterSituacaoFrete(): Promise<SituacaoFrete> {
  await requireArea('pedidos')
  const impedimentos: string[] = []

  const config = configMelhorEnvio()
  if (!config) {
    impedimentos.push(
      'O token do Melhor Envio não está configurado (MELHOR_ENVIO_TOKEN).',
    )
  }

  const origem = await obterOrigemFrete()
  if (!origem) {
    impedimentos.push(
      'A empresa principal está sem CEP. Cadastre o endereço dela em Empresas — é a origem do envio.',
    )
  }

  const faixas = await listarFaixasParaCalculo()
  if (faixas.length === 0) {
    impedimentos.push(
      'Nenhuma faixa de embalagem cadastrada. Sem elas não dá pra saber o tamanho do pacote.',
    )
  }

  return {
    podeCotar: impedimentos.length === 0,
    impedimentos,
    sandbox: config ? ehSandbox(config) : false,
    origem,
    capacidadeGramas: faixas.reduce(
      (m, f) => Math.max(m, f.pesoAteGramas),
      0,
    ),
  }
}

export type PacoteNaTela = {
  pesoGramas: number
  medidas: string
  valorDeclaradoCentavos: number
}

export type CotacaoFeita = {
  servicos: ServicoCotado[]
  comErro: ServicoComErro[]
  pacotes: PacoteNaTela[]
  cepDestino: string
  valorDeclaradoCentavos: number
  sandbox: boolean
}

function paraTela(
  pacotes: Pacote[],
  volumes: { insurance_value: number }[],
): PacoteNaTela[] {
  return pacotes.map((p, i) => ({
    pesoGramas: p.pesoGramas,
    medidas: formatarMedidas(p),
    valorDeclaradoCentavos: Math.round((volumes[i]?.insurance_value ?? 0) * 100),
  }))
}

/**
 * Cota o frete deste pedido. NÃO grava nada — gravar é `salvarFreteAction`,
 * porque cotar é consulta e escolher é decisão.
 *
 * ESCOPO: só cota. Não gera, não paga e não compra etiqueta.
 */
export async function cotarFreteAction(
  orcamentoId: string,
  cepDigitado: string | null,
): Promise<ActionResult<CotacaoFeita>> {
  await requireArea('pedidos')

  const config = configMelhorEnvio()
  if (!config) {
    return {
      success: false,
      error: 'O token do Melhor Envio não está configurado.',
    }
  }

  const [orcamento, origem, faixas, catalogo] = await Promise.all([
    obterOrcamento(orcamentoId),
    obterOrigemFrete(),
    listarFaixasParaCalculo(),
    obterCatalogoDePesos(),
  ])
  if (!orcamento) return { success: false, error: 'Pedido não encontrado' }
  if (!origem) {
    return {
      success: false,
      error: 'A empresa principal está sem CEP — cadastre o endereço dela em Empresas.',
    }
  }

  // PESO INCOMPLETO BLOQUEIA. Peso a menos vira frete a menos, e a diferença
  // só aparece na fatura. A mensagem diz QUAIS itens faltam pra dar pra
  // resolver caso a caso.
  const pesos = calcularPesos(orcamento.itens, catalogo)
  if (pesos.itensSemPeso > 0) {
    const semPeso = orcamento.itens
      .filter((it) => pesos.porItem[it.id] == null)
      .map((it) => it.descricao)
    const lista = semPeso.slice(0, 5).join('; ')
    const resto =
      semPeso.length > 5 ? ` … e mais ${semPeso.length - 5}` : ''
    return {
      success: false,
      error: `Não dá pra cotar: ${semPeso.length} item(ns) sem peso cadastrado — ${lista}${resto}.`,
    }
  }

  // Destino: o CEP digitado ganha do cadastro (é a correção na hora), e o
  // cadastro do comprador vinculado é o padrão.
  let cepDestino = soDigitosCep(cepDigitado ?? '')
  if (cepDestino.length !== 8 && orcamento.compradorId) {
    const [c] = await db
      .select({ cep: compradores.cep })
      .from(compradores)
      .where(
        and(
          eq(compradores.id, orcamento.compradorId),
          isNull(compradores.deletedAt),
        ),
      )
      .limit(1)
    cepDestino = soDigitosCep(c?.cep ?? '')
  }
  if (cepDestino.length !== 8) {
    return {
      success: false,
      error: 'Informe o CEP de destino (8 dígitos) — o cliente deste pedido não tem CEP cadastrado.',
    }
  }

  // A MERCADORIA, somada dos itens — NUNCA `orcamento.totalComFrete`.
  //
  // Daqui sai o valor declarado (40% disto, em src/lib/frete.ts). Declarar o
  // frete dentro do seguro da própria carga não faz sentido — o que se
  // segura é o que está dentro do pacote — e ainda encarece a cotação, que
  // por sua vez aumentaria o frete: a conta se persegue.
  //
  // Somar por item em vez de ler `orcamento.total` é de propósito: aqui tudo
  // é centavo inteiro, e o `total` já vem convertido pra reais.
  const totalCentavos = orcamento.itens.reduce(
    (s, it) => s + Math.round(it.quantidade * Number(it.precoUnitario) * 100),
    0,
  )

  const montagem = montarCotacao({
    cepOrigem: origem.cep,
    cepDestino,
    pesoGramas: pesos.totalGramas,
    totalCentavos,
    faixas,
  })
  if (!montagem.ok) return { success: false, error: montagem.erro }

  const resultado = await cotarFrete(montagem.corpo, config)
  if (!resultado.ok) return { success: false, error: resultado.erro }

  return {
    success: true,
    data: {
      servicos: resultado.servicos,
      comErro: resultado.comErro,
      pacotes: paraTela(montagem.pacotes, montagem.corpo.volumes),
      cepDestino,
      // O que foi DECLARADO, que é uma fração do total do pedido — a tela
      // mostra este número, não o total.
      valorDeclaradoCentavos: valorDeclaradoCentavos(totalCentavos),
      sandbox: ehSandbox(config),
    },
  }
}

/**
 * Grava um frete DIGITADO À MÃO, do painel do pedido.
 *
 * Existe porque digitar um valor exigia voltar pra lista e abrir o diálogo de
 * editar — e o caso em que mais se precisa disso é justamente quando a
 * cotação está bloqueada (sem token, sem CEP de origem, item sem peso), onde
 * o simulador nem aparece. Combinar frete por telefone e digitar o valor é
 * rotina, não exceção.
 *
 * ⚠️ SEMPRE LIMPA A PROCEDÊNCIA. Transportadora, serviço, prazo, CEP e data
 * da cotação descrevem UM valor: o que a cotação devolveu. Mantê-los ao lado
 * de um número digitado faria a tela dizer "Correios PAC · 5 dias — R$ 80"
 * pra um frete que ninguém cotou. Em `atualizarOrcamentoAction`
 * (./actions.ts) essa limpeza é condicional, porque lá o valor pode não ter
 * mudado; aqui vale SEMPRE — por definição o valor veio da mão.
 *
 * VAZIO VIRA NULL, nunca zero. "Sem frete" é a ausência: um `0.00` gravado
 * faria o documento imprimir "Frete R$ 0,00", que é a afirmação "o frete é
 * por nossa conta" — ver `temFrete` em src/lib/total-pedido.ts.
 */
export async function definirFreteManualAction(
  orcamentoId: string,
  valor: string | null,
): Promise<ActionResult> {
  await requireAreaEscrita('pedidos')

  const [atual] = await db
    .select({ id: orcamentos.id })
    .from(orcamentos)
    .where(and(eq(orcamentos.id, orcamentoId), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Pedido não encontrado' }

  const limpo = valor?.trim() ?? ''
  let freteValor: string | null = null
  if (limpo !== '') {
    const centavos = Math.round(Number(limpo) * 100)
    if (!Number.isFinite(centavos) || centavos < 0) {
      return { success: false, error: 'Valor de frete inválido' }
    }
    // Zero digitado também vira "sem frete": o usuário quis dizer "não tem",
    // e guardar o zero faria a linha aparecer no documento.
    freteValor = centavos > 0 ? (centavos / 100).toFixed(2) : null
  }

  await db
    .update(orcamentos)
    .set({
      freteValor,
      freteTransportadora: null,
      freteServico: null,
      fretePrazoDias: null,
      freteCotadoEm: null,
      freteCepDestino: null,
    })
    .where(eq(orcamentos.id, orcamentoId))

  revalidatePath(`/pedidos/${orcamentoId}`)
  revalidatePath('/pedidos')
  return {
    success: true,
    message: freteValor ? 'Frete salvo no pedido' : 'Frete removido do pedido',
  }
}

/**
 * Grava a cotação escolhida no pedido. É SNAPSHOT: recotar depois não
 * reescreve isto sozinho — só outra escolha explícita reescreve. Ver
 * AGENTS.md, "Peso é recalculado, preço é snapshot"; frete segue o preço.
 */
export async function salvarFreteAction(
  orcamentoId: string,
  escolha: {
    transportadora: string
    servico: string
    precoCentavos: number
    prazoDias: number | null
    cepDestino: string
  },
): Promise<ActionResult> {
  await requireAreaEscrita('pedidos')

  const [atual] = await db
    .select({ id: orcamentos.id })
    .from(orcamentos)
    .where(and(eq(orcamentos.id, orcamentoId), isNull(orcamentos.deletedAt)))
    .limit(1)
  if (!atual) return { success: false, error: 'Pedido não encontrado' }

  if (!Number.isFinite(escolha.precoCentavos) || escolha.precoCentavos < 0) {
    return { success: false, error: 'Valor de frete inválido' }
  }

  await db
    .update(orcamentos)
    .set({
      freteTransportadora: escolha.transportadora,
      freteServico: escolha.servico,
      freteValor: (escolha.precoCentavos / 100).toFixed(2),
      fretePrazoDias: escolha.prazoDias,
      freteCepDestino: soDigitosCep(escolha.cepDestino),
      freteCotadoEm: new Date(),
    })
    .where(eq(orcamentos.id, orcamentoId))

  revalidatePath(`/pedidos/${orcamentoId}`)
  revalidatePath('/pedidos')
  return { success: true, message: 'Frete salvo no pedido' }
}
