// Cotação de frete: divisão do pedido em pacotes e montagem do corpo da
// requisição — helper PURO, sem HTTP e sem banco. Quem fala com o Melhor
// Envio é src/lib/melhor-envio.ts, que só transporta o que sai daqui.
//
// A SEPARAÇÃO É DE PROPÓSITO: dá pra conferir o payload inteiro, com pedido
// de verdade, sem gastar uma chamada na API nem depender de token.
//
// ─────────────────────────────────────────────────────────────────────────
// A PREMISSA DA RÉGUA DE PESO — leia antes de "consertar"
// ─────────────────────────────────────────────────────────────────────────
// O que obriga o segundo pacote na vida real é VOLUME, não peso: o pacote
// enche antes de pesar. O peso é só a régua POSSÍVEL — é o que o sistema
// sabe calcular a partir do pedido (src/lib/peso.ts), enquanto o volume que
// cada peça ocupa dobrada ninguém mede.
//
// Ela funciona por dois motivos, e os dois podem deixar de valer:
//   1. a malha tem densidade parecida entre os modelos, então peso e volume
//      andam juntos;
//   2. a tabela de faixas foi medida em PACOTES REAIS, então ela já mapeia
//      "este peso costuma dar um pacote deste tamanho".
//
// ONDE QUEBRA: pedido de peça muito volumosa e leve — o pacote estoura antes
// de bater o teto de peso, e a cotação sai barata demais. Se isso começar a
// acontecer, a saída NÃO é mexer nos números das faixas: é passar a ter uma
// medida de volume por peça e trocar a régua. Não troque a régua por achar
// que peso é estranho; ela é peso por falta de dado melhor, não por engano.
//
// ─────────────────────────────────────────────────────────────────────────
// UNIDADES
// ─────────────────────────────────────────────────────────────────────────
// Dentro do sistema o peso é em GRAMAS inteiras e o dinheiro em CENTAVOS
// inteiros — inteiro não acumula erro de ponto flutuante ao somar dezenas de
// itens. A API do Melhor Envio quer kg e reais com 2 casas: a conversão
// acontece na BORDA, em `montarVolumes`/`montarCotacao`, e em lugar nenhum
// antes disso.

/** Uma faixa da tabela de embalagem. `pesoAteGramas` é o TETO da faixa. */
export type FaixaDeEmbalagem = {
  pesoAteGramas: number
  alturaCm: number
  larguraCm: number
  comprimentoCm: number
}

/** Um pacote a despachar, já com as medidas resolvidas. */
export type Pacote = {
  pesoGramas: number
  alturaCm: number
  larguraCm: number
  comprimentoCm: number
}

// ─────────────────────────────────────────────────────────────────────────
// Limites dos Correios (PAC/SEDEX)
// ─────────────────────────────────────────────────────────────────────────
//
// Valem AQUI e na tela de cadastro das faixas, não só na hora de cotar. Uma
// faixa que gere volume inválido, checada só na cotação, aparece como erro
// no meio de um pedido e sem dizer que a culpa é do cadastro.

export const LIMITE_SOMA_CM = 200
export const LIMITE_LADO_CM = 100
export const LIMITE_CUBADO_KG = 30
/** Acima disso os Correios cobram taxa extra. É AVISO, não impedimento. */
export const LADO_TAXA_EXTRA_CM = 70
/** Divisor da cubagem dos Correios. */
const DIVISOR_CUBAGEM = 6000

export function pesoCubadoKg(m: {
  alturaCm: number
  larguraCm: number
  comprimentoCm: number
}): number {
  return (m.comprimentoCm * m.larguraCm * m.alturaCm) / DIVISOR_CUBAGEM
}

export type AvaliacaoDeMedidas = {
  /** Impedem o envio: cadastro com qualquer um destes é recusado. */
  erros: string[]
  /** Encarecem mas não impedem — o usuário decide. */
  avisos: string[]
}

const num = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/**
 * Avalia UM pacote contra os limites dos Correios. As mensagens trazem a
 * CONTA feita, não só o veredito: quem cadastrou precisa saber quanto passou
 * pra saber o que mudar.
 */
export function avaliarMedidas(m: {
  alturaCm: number
  larguraCm: number
  comprimentoCm: number
}): AvaliacaoDeMedidas {
  const erros: string[] = []
  const avisos: string[] = []

  const soma = m.alturaCm + m.larguraCm + m.comprimentoCm
  if (soma > LIMITE_SOMA_CM) {
    erros.push(
      `A soma das três medidas dá ${num(soma)} cm ` +
        `(${num(m.alturaCm)} + ${num(m.larguraCm)} + ${num(m.comprimentoCm)}) ` +
        `e o limite dos Correios é ${LIMITE_SOMA_CM} cm.`,
    )
  }

  const maiorLado = Math.max(m.alturaCm, m.larguraCm, m.comprimentoCm)
  if (maiorLado > LIMITE_LADO_CM) {
    erros.push(
      `O maior lado tem ${num(maiorLado)} cm e nenhum lado pode passar de ` +
        `${LIMITE_LADO_CM} cm.`,
    )
  }

  const cubado = pesoCubadoKg(m)
  if (cubado > LIMITE_CUBADO_KG) {
    erros.push(
      `O peso cubado dá ${num(cubado)} kg ` +
        `(${num(m.comprimentoCm)} × ${num(m.larguraCm)} × ${num(m.alturaCm)} ÷ ` +
        `${DIVISOR_CUBAGEM}) e o limite é ${LIMITE_CUBADO_KG} kg.`,
    )
  }

  // Só avisa quando já não é erro: um lado de 120 cm não precisa também
  // dizer que passa dos 70.
  if (maiorLado > LADO_TAXA_EXTRA_CM && maiorLado <= LIMITE_LADO_CM) {
    avisos.push(
      `O maior lado tem ${num(maiorLado)} cm; acima de ` +
        `${LADO_TAXA_EXTRA_CM} cm os Correios cobram taxa extra.`,
    )
  }

  return { erros, avisos }
}

// ─────────────────────────────────────────────────────────────────────────
// Divisão em pacotes
// ─────────────────────────────────────────────────────────────────────────

/** Ordena por teto crescente — a maior faixa é a capacidade de um pacote. */
export function ordenarFaixas(faixas: FaixaDeEmbalagem[]): FaixaDeEmbalagem[] {
  return [...faixas].sort((a, b) => a.pesoAteGramas - b.pesoAteGramas)
}

export function capacidadeGramas(faixas: FaixaDeEmbalagem[]): number {
  return faixas.reduce((m, f) => Math.max(m, f.pesoAteGramas), 0)
}

/** A menor faixa que comporta este peso, ou `null` se nenhuma comporta. */
export function faixaPara(
  pesoGramas: number,
  faixas: FaixaDeEmbalagem[],
): FaixaDeEmbalagem | null {
  return (
    ordenarFaixas(faixas).find((f) => f.pesoAteGramas >= pesoGramas) ?? null
  )
}

/**
 * Divide o peso do pedido em pacotes: enche na CAPACIDADE (a maior faixa) e
 * põe a sobra num último, dimensionado pela faixa que a comporta.
 *
 * Ex. com capacidade de 27 kg: 21,7 kg cabe em um volume só; 89 kg vira três
 * de 27 e um de 8, e o de 8 sai com as medidas da faixa de 9 kg, não com as
 * da maior — um pacote pela metade não ocupa o tamanho todo.
 *
 * Peso exato do múltiplo não gera um pacote vazio no fim (54 kg = dois de 27).
 */
export function dividirEmPacotes(
  pesoGramas: number,
  faixas: FaixaDeEmbalagem[],
): Pacote[] {
  if (pesoGramas <= 0 || faixas.length === 0) return []
  const ordenadas = ordenarFaixas(faixas)
  const maior = ordenadas[ordenadas.length - 1]!
  const capacidade = maior.pesoAteGramas

  const pacotes: Pacote[] = []
  let restante = pesoGramas

  while (restante > capacidade) {
    pacotes.push({
      pesoGramas: capacidade,
      alturaCm: maior.alturaCm,
      larguraCm: maior.larguraCm,
      comprimentoCm: maior.comprimentoCm,
    })
    restante -= capacidade
  }

  const faixa = faixaPara(restante, ordenadas)
  // `restante` é sempre <= capacidade aqui, então a maior faixa sempre serve;
  // o `?? maior` existe só pra não depender dessa leitura pra não quebrar.
  const f = faixa ?? maior
  pacotes.push({
    pesoGramas: restante,
    alturaCm: f.alturaCm,
    larguraCm: f.larguraCm,
    comprimentoCm: f.comprimentoCm,
  })

  return pacotes
}

// ─────────────────────────────────────────────────────────────────────────
// Valor declarado
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fração do total do pedido que vai DECLARADA no envio.
 *
 * É DECISÃO COMERCIAL DA CASA, não regra de transportadora nem dos Correios —
 * nada na API exige isso, e a API aceitaria o total cheio sem reclamar. O que
 * este número controla é o quanto a casa aceita perder: o seguro indeniza
 * sobre o DECLARADO, então declarar 40% é aceitar receber 40% se o volume
 * sumir, em troca de um frete mais barato. Mudar o número é mudar esse trato,
 * não afinar um cálculo.
 */
export const FRACAO_VALOR_DECLARADO = 0.4

/**
 * Quanto vai declarado neste pedido — o número que a soma dos volumes tem que
 * fechar. O arredondamento pra centavo inteiro acontece UMA vez, aqui, ANTES
 * do rateio: assim `ratearValorDeclarado` continua sendo só rateio, e a soma
 * das partes bate exatamente com o que a tela mostra.
 */
export function valorDeclaradoCentavos(totalCentavos: number): number {
  return Math.round(totalCentavos * FRACAO_VALOR_DECLARADO)
}

/**
 * Rateia o VALOR DECLARADO entre os volumes, proporcional ao peso de cada um.
 * Recebe o valor já decidido (ver `valorDeclaradoCentavos`), não o total do
 * pedido — aqui só se divide.
 *
 * REPETIR o valor em cada volume declararia várias vezes e encareceria o
 * seguro — no modo VOLUMES o valor é POR VOLUME, diferente do modo
 * `products`, onde é por unidade. A soma fecha exatamente o valor recebido:
 * os primeiros vão pelo piso e a sobra de arredondamento cai no último, que
 * por isso nunca fica a menos.
 *
 * Tudo em CENTAVOS inteiros; a conversão pra reais é na borda.
 */
export function ratearValorDeclarado(
  valorCentavos: number,
  pacotes: Pacote[],
): number[] {
  if (pacotes.length === 0) return []
  if (pacotes.length === 1) return [valorCentavos]

  const somaPeso = pacotes.reduce((s, p) => s + p.pesoGramas, 0)
  if (somaPeso <= 0) {
    // Sem peso não há proporção: divide igual e a sobra vai pro último.
    const base = Math.floor(valorCentavos / pacotes.length)
    const partes = pacotes.map(() => base)
    partes[partes.length - 1] = valorCentavos - base * (pacotes.length - 1)
    return partes
  }

  const partes = pacotes.map((p) =>
    Math.floor((valorCentavos * p.pesoGramas) / somaPeso),
  )
  const distribuido = partes.slice(0, -1).reduce((s, v) => s + v, 0)
  partes[partes.length - 1] = valorCentavos - distribuido
  return partes
}

// ─────────────────────────────────────────────────────────────────────────
// Corpo da requisição
// ─────────────────────────────────────────────────────────────────────────

/**
 * Um volume como a API espera: cm e KG.
 *
 * O valor declarado vai em DUAS chaves com o mesmo número. A referência
 * mostra `insurance` no exemplo de volumes, enquanto o texto e a comunidade
 * falam em `insurance_value`; campo desconhecido é ignorado, então mandar as
 * duas custa nada e tira a dúvida do caminho. Há relato de a API devolver
 * `insurance_value: "1.00"` ignorando o enviado — por isso a tela mostra o
 * valor que NÓS declaramos, pra divergência aparecer na cotação e não na
 * fatura.
 */
export type VolumeApi = {
  width: number
  height: number
  length: number
  weight: number
  insurance_value: number
  insurance: number
}

export type CorpoCotacao = {
  from: { postal_code: string }
  to: { postal_code: string }
  volumes: VolumeApi[]
  options: { receipt: boolean; own_hand: boolean }
}

/** Gramas -> kg com 3 casas (1 g de resolução, que é o que a balança dá). */
function gramasParaKg(g: number): number {
  return Math.round(g) / 1000
}

/** Centavos -> reais com 2 casas. */
function centavosParaReais(c: number): number {
  return Math.round(c) / 100
}

export function soDigitosCep(cep: string): string {
  return cep.replace(/\D/g, '')
}

export function montarVolumes(
  pacotes: Pacote[],
  totalCentavos: number,
): VolumeApi[] {
  // Recebe o TOTAL do pedido e declara a fração dela — a redução vem ANTES do
  // rateio, pra soma dos volumes fechar exatamente o declarado.
  const valores = ratearValorDeclarado(
    valorDeclaradoCentavos(totalCentavos),
    pacotes,
  )
  return pacotes.map((p, i) => {
    const valor = centavosParaReais(valores[i] ?? 0)
    return {
      width: p.larguraCm,
      height: p.alturaCm,
      length: p.comprimentoCm,
      weight: gramasParaKg(p.pesoGramas),
      insurance_value: valor,
      insurance: valor,
    }
  })
}

export type EntradaCotacao = {
  cepOrigem: string
  cepDestino: string
  pesoGramas: number
  totalCentavos: number
  faixas: FaixaDeEmbalagem[]
}

export type MontagemCotacao =
  | { ok: true; corpo: CorpoCotacao; pacotes: Pacote[] }
  | { ok: false; erro: string }

/**
 * Monta o corpo da requisição, ou explica por que não dá.
 *
 * `services` fica de fora de propósito: sem ele a API devolve todas as
 * transportadoras habilitadas na conta, que é o que se quer numa cotação
 * para o cliente escolher.
 */
export function montarCotacao(entrada: EntradaCotacao): MontagemCotacao {
  const origem = soDigitosCep(entrada.cepOrigem)
  const destino = soDigitosCep(entrada.cepDestino)
  if (origem.length !== 8) {
    return { ok: false, erro: 'CEP de origem inválido (precisa de 8 dígitos)' }
  }
  if (destino.length !== 8) {
    return { ok: false, erro: 'CEP de destino inválido (precisa de 8 dígitos)' }
  }
  if (entrada.faixas.length === 0) {
    return {
      ok: false,
      erro: 'Nenhuma faixa de embalagem cadastrada — sem elas não dá pra saber o tamanho do pacote',
    }
  }
  if (entrada.pesoGramas <= 0) {
    return { ok: false, erro: 'O pedido está sem peso' }
  }

  const pacotes = dividirEmPacotes(entrada.pesoGramas, entrada.faixas)
  return {
    ok: true,
    pacotes,
    corpo: {
      from: { postal_code: origem },
      to: { postal_code: destino },
      volumes: montarVolumes(pacotes, entrada.totalCentavos),
      options: { receipt: false, own_hand: false },
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Formatação
// ─────────────────────────────────────────────────────────────────────────

export function formatarKgFrete(gramas: number): string {
  return `${(gramas / 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} kg`
}

export function formatarMedidas(p: {
  alturaCm: number
  larguraCm: number
  comprimentoCm: number
}): string {
  return `${num(p.alturaCm)} × ${num(p.larguraCm)} × ${num(p.comprimentoCm)} cm`
}
