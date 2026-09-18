// O QUE A TELA DE VENDAS DEVOLVE PRA QUEM DIGITA.
//
// A tela cobra 26 campos por dia e, até aqui, não devolvia nada: nem "faltou
// lançar anteontem", nem "esse número está estranho", nem "essa conta parou de
// vender em julho". Quem lança abre os painéis dos marketplaces e transcreve —
// o trabalho está lá fora, e aqui é digitação.
//
// Os números que motivaram cada regra (banco, 18/09/2026): 717 dias lançados
// sem um único buraco; o lançamento é quase sempre do dia anterior (58 dias com
// 1 de atraso, 15 com 2, 14 com 3 — e só 6 no mesmo dia); das 13 contas do
// formulário, 8 estão vivas; Temu somou 2 peças em 2 dias e a Amazon faz ~3
// peças por dia.
//
// Tudo aqui é PURO: sem banco, sem React. O histórico chega pronto de uma
// consulta só (35 dias), e estas funções só olham pra ele.

export type LinhaDoHistorico = {
  /** YYYY-MM-DD */
  data: string
  conta: string
  quantidade: number
  /** Em reais, como vem do banco. Null = não informado. */
  faturamento: number | null
}

export type CampoDaConferencia = 'quantidade' | 'faturamento'

// -----------------------------------------------------------------
// Dias em aberto
// -----------------------------------------------------------------

/**
 * Os dias sem lançamento que JÁ PASSARAM DA ROTINA, mais recente primeiro.
 *
 * ⚠️ TRÊS DIAS DE FOLGA, E NÃO UM. O lançamento é sempre depois — em 717
 * dias, só 6 foram lançados no próprio dia —, e o ritmo normal da casa é:
 * quarta se lança na quinta (pra o dia fechar inteiro), e sexta, sábado e
 * domingo se lançam todos na segunda. Cobrar a sexta na segunda é cobrar
 * alguém que está em dia; a faixa ficaria acesa toda semana, e faixa que vive
 * acesa ninguém lê.
 *
 * Com a folga de 3 dias, a sexta só vira pendência na terça — quando ela
 * realmente ficou pra trás.
 *
 * ⚠️ HOJE NÃO ENTRA, pelo mesmo motivo: o dia ainda nem fechou.
 *
 * FIM DE SEMANA ENTRA na conta de dias. Eles lançam sábado e domingo também
 * (zero dias sem lançamento em dois anos), então sábado não é "dia que não
 * conta" — ele só chega junto com a sexta, na segunda, e a folga cobre isso.
 */
export function diasEmAberto(
  datasComLancamento: readonly string[],
  hoje: string,
  janela = 10,
  tolerancia = 3,
): string[] {
  const tem = new Set(datasComLancamento)
  const faltando: string[] = []
  for (let i = tolerancia + 1; i <= janela; i++) {
    const dia = somarDias(hoje, -i)
    if (!tem.has(dia)) faltando.push(dia)
  }
  return faltando
}

/** YYYY-MM-DD + n dias, sem fuso no meio (tudo em UTC). */
export function somarDias(iso: string, n: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(ano!, mes! - 1, dia! + n))
  return d.toISOString().slice(0, 10)
}

/** 0 = domingo … 6 = sábado. Só pra agrupar por dia da semana. */
function diaDaSemana(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano!, mes! - 1, dia!)).getUTCDay()
}

// -----------------------------------------------------------------
// Contas paradas
// -----------------------------------------------------------------

/**
 * As contas que não tiveram NENHUM lançamento na janela — as que saem do
 * formulário (ficam atrás de "mostrar contas paradas").
 *
 * ⚠️ CONTA COM VALOR NO DIA ABERTO NUNCA É PARADA. Ao editar um dia de julho,
 * a shein_5 tem número lá: escondê-la sumiria com um valor que está gravado, e
 * o total do rodapé deixaria de fechar com a soma dos campos visíveis.
 *
 * A janela conta a partir do DIA ABERTO, não de hoje: quem edita um dia antigo
 * precisa ver o formulário que fazia sentido naquele dia.
 */
export function contasParadas(
  historico: readonly LinhaDoHistorico[],
  contasDoCatalogo: readonly string[],
  diaAberto: string,
  dias = 30,
): string[] {
  const limite = somarDias(diaAberto, -dias)
  const vivas = new Set<string>()
  for (const l of historico) {
    if (l.data < limite || l.data > diaAberto) continue
    if (l.quantidade > 0 || (l.faturamento ?? 0) > 0) vivas.add(l.conta)
    // Valor no próprio dia aberto mantém a conta visível mesmo zerada: é a
    // linha que a pessoa está olhando agora.
    if (l.data === diaAberto) vivas.add(l.conta)
  }
  return contasDoCatalogo.filter((c) => !vivas.has(c))
}

// -----------------------------------------------------------------
// Referência: o normal desta conta neste dia da semana
// -----------------------------------------------------------------

export type Referencia = {
  /** Mediana das últimas ocorrências do mesmo dia da semana. */
  mediana: number
  /** Quantos valores entraram na mediana. */
  amostras: number
}

/**
 * O normal daquela conta NAQUELE DIA DA SEMANA.
 *
 * Por dia da semana, e não pelos últimos N dias corridos, porque a venda de
 * marketplace tem semana: segunda não se parece com domingo. Uma janela de 35
 * dias dá 4 a 5 ocorrências de cada dia da semana, e ficamos com as 4 últimas
 * — o suficiente pra ter mediana e recente o bastante pra acompanhar a
 * sazonalidade.
 *
 * MEDIANA, e não média: uma Black Friday no meio da janela dobraria a média e
 * faria o dia normal seguinte parecer "baixo".
 *
 * O próprio dia aberto fica DE FORA: ele é o que está sendo conferido.
 */
export function referenciaDaConta(
  historico: readonly LinhaDoHistorico[],
  conta: string,
  diaAberto: string,
  campo: CampoDaConferencia,
): Referencia {
  const semana = diaDaSemana(diaAberto)
  const valores = historico
    .filter(
      (l) =>
        l.conta === conta &&
        l.data < diaAberto &&
        diaDaSemana(l.data) === semana,
    )
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 4)
    .map((l) => (campo === 'quantidade' ? l.quantidade : (l.faturamento ?? 0)))

  return { mediana: mediana(valores), amostras: valores.length }
}

function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  return ordenados.length % 2 === 1
    ? ordenados[meio]!
    : (ordenados[meio - 1]! + ordenados[meio]!) / 2
}

// -----------------------------------------------------------------
// Fora do normal
// -----------------------------------------------------------------

export type Anomalia = 'alto' | 'baixo' | 'zerado'

// O PISO DE RUÍDO. Sem ele, Temu (2 peças em 2 dias) e Amazon (~3 peças/dia)
// acenderiam aviso todo santo dia: com mediana 3, qualquer 10 é "3× o normal".
// Aviso que sempre acende vira decoração, e aí o dia em que o Mercado Livre
// cair pela metade passa batido junto.
const MINIMO_AMOSTRAS = 3
const PISO_QUANTIDADE = 10
const PISO_FATURAMENTO = 1000

/**
 * Este valor merece uma olhada?
 *
 * 'zerado' é o aviso mais útil dos três: o erro comum não é digitar errado, é
 * PULAR uma conta — a janela do marketplace não abriu, o pedido de senha
 * atravessou, e a linha fica em branco no meio de 26 campos.
 *
 * `null` quer dizer "não sei opinar", e é o padrão: sem histórico suficiente
 * ou em conta miúda, esta função se cala.
 */
export function foraDoNormal(
  valor: number | null,
  referencia: Referencia,
  campo: CampoDaConferencia = 'quantidade',
): Anomalia | null {
  const piso = campo === 'quantidade' ? PISO_QUANTIDADE : PISO_FATURAMENTO
  if (referencia.amostras < MINIMO_AMOSTRAS) return null
  if (referencia.mediana < piso) return null

  const v = valor ?? 0
  if (v <= 0) return 'zerado'
  if (v >= referencia.mediana * 3) return 'alto'
  if (v <= referencia.mediana / 3) return 'baixo'
  return null
}

// -----------------------------------------------------------------
// Atacado: duas origens, um dia
// -----------------------------------------------------------------

/**
 * As duas origens do atacado têm número no mesmo dia?
 *
 * As duas continuam existindo de propósito: nem todo pedido de atacado passa
 * pelo sistema, e fechar o campo manual apagaria faturamento real do mês. Mas
 * quando o pedido ENTROU pelo sistema e alguém lança o mesmo dinheiro à mão, o
 * dia conta a venda duas vezes — e ninguém percebe, porque o total do mês
 * continua "fazendo sentido".
 *
 * Isto só AVISA. Pode ser dobra, pode ser um pedido de fora somado a outro de
 * dentro; quem sabe é quem está olhando.
 */
export function avisoDeAtacadoDuplo(
  manual: { quantidade: number; faturamento: number | null } | null,
  espelho: { quantidade: number; faturamento: number | null } | null,
): boolean {
  const tem = (x: typeof manual) =>
    x !== null && (x.quantidade > 0 || (x.faturamento ?? 0) > 0)
  return tem(manual) && tem(espelho)
}
