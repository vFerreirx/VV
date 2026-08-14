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
  await requireArea('vendas')
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
  await requireArea('vendas')

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
  await requireAreaEscrita('vendas')

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
