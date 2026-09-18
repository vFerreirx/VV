// O estoque de fios como a fábrica sempre o viu: uma linha por lote, na
// mesma ordem e com as mesmas contas da planilha que a tela substituiu.
//
// Nada aqui agrupa por cor. A cor REPETE em toda linha, como no Excel —
// agrupar economizaria pixels e custaria o reconhecimento, que é o ponto:
// quem trabalhava na planilha tem que abrir a tela e achar a linha onde
// espera. (Houve uma versão com cartões agrupados por cor; saiu junto com
// `agruparSaldoPorCor` quando a grade chegou.)
//
// Lógica PURA: o saldo de cada lote já chega calculado do banco (uma
// consulta agregada pra lista inteira, sem N+1); aqui só se ordena e soma.

export type LoteComSaldo = {
  id: string
  numeroLote: string | null
  /** A cor do FORNECEDOR, que é o eixo da grade e do resumo. */
  corFornecedorId: string
  corId: string
  corNome: string
  corHex: string | null
  corFornecedorNome: string
  caixas: number
  pesoTotalKg: string
  dataEntrada: string
  saldoCaixas: number
  saldoPesoKg: number
}

// Comparação de texto na ordem que o usuário espera ler, com `numeric` pra
// que a partida 1193 venha antes da 80450 (e não "1193" < "80450" < "BH…"
// por código de caractere).
function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
}

/**
 * Cor em ordem alfabética e, dentro da cor, por partida.
 *
 * DETERMINÍSTICA: o `id` no fim é o desempate que garante que a mesma linha
 * caia sempre no mesmo lugar. Sem ele, dois lotes com a mesma cor e a mesma
 * partida — que existem de verdade, o Cáqui 4660 aparece duas vezes na
 * planilha — trocariam de posição entre uma leitura e outra conforme a
 * ordem que o banco devolvesse, e a grade pareceria instável sem nada ter
 * mudado.
 *
 * A cor usada é a do FORNECEDOR, não a do catálogo: a grade é o espelho da
 * planilha dele, e é "Cáqui"/"Black" que estão escritos na etiqueta da
 * caixa. O de-para para a cor do catálogo continua onde importa, no
 * cadastro.
 */
export function ordenarParaGrade(lotes: LoteComSaldo[]): LoteComSaldo[] {
  return [...lotes].sort((a, b) => {
    const cor = compararTexto(a.corFornecedorNome, b.corFornecedorNome)
    if (cor !== 0) return cor
    // Lote sem número vai pro fim da cor: é a linha que ninguém consegue
    // procurar pelo código, então não pode ficar no meio das que dá.
    if (!a.numeroLote !== !b.numeroLote) return a.numeroLote ? -1 : 1
    const partida = compararTexto(a.numeroLote ?? '', b.numeroLote ?? '')
    if (partida !== 0) return partida
    return a.id.localeCompare(b.id)
  })
}

export type TotalGrade = {
  lotes: number
  caixas: number
  retiradaCaixas: number
  saldoCaixas: number
  saldoPesoKg: number
}

/**
 * A linha de TOTAL do rodapé, somada das MESMAS linhas que a grade mostra.
 *
 * Nunca constante: o rodapé é o que se confere contra a planilha, e um
 * número escrito à mão continuaria "batendo" no dia em que a conta
 * quebrasse — que é exatamente o dia em que ele precisa denunciar.
 * Por sair da lista recebida, ele acompanha o filtro de cor, como o
 * SUBTOTAL de uma planilha filtrada acompanha.
 */
export function totalDaGrade(lotes: LoteComSaldo[]): TotalGrade {
  const caixas = lotes.reduce((s, l) => s + l.caixas, 0)
  const saldoCaixas = lotes.reduce((s, l) => s + l.saldoCaixas, 0)
  const saldoPesoKg = lotes.reduce((s, l) => s + l.saldoPesoKg, 0)
  return {
    lotes: lotes.length,
    caixas,
    retiradaCaixas: caixas - saldoCaixas,
    saldoCaixas,
    // 2 casas: é a precisão da coluna no banco, e somar 51 floats sem
    // arredondar deixa centavo de kg sobrando no rodapé.
    saldoPesoKg: Math.round(saldoPesoKg * 100) / 100,
  }
}

// As cores presentes, pro filtro do topo (no espírito do AutoFilter: as
// opções são os valores que existem na coluna, não um cadastro à parte).
export function coresDaGrade(lotes: LoteComSaldo[]): string[] {
  return [...new Set(lotes.map((l) => l.corFornecedorNome))].sort(compararTexto)
}

// -----------------------------------------------------------------
// Resumo por cor — a manchete da tela
// -----------------------------------------------------------------

// A GRADE CONTINUA SENDO A GRADE, e este resumo vive ACIMA dela. São duas
// perguntas, e a ordem entre elas é a novidade: "quanto tem de Cáqui?" vem
// primeiro, "em que partidas isso está?" logo abaixo. A grade não muda de
// formato porque é por ela que a fábrica confere contra a planilha.
//
// ⚠️ AS DUAS CONTAS SAEM DA MESMA LISTA de lotes. O resumo somado tem que
// bater com a linha de TOTAL do rodapé da grade; se um dia divergirem, é
// porque alguém passou listas diferentes pra cá e pra `totalDaGrade`.

export type EstadoDaCor = 'acabou' | 'abaixo' | 'ok'

export type LinhaDoResumo = {
  corFornecedorId: string
  corFornecedorNome: string
  /** A cor do catálogo, pro de-para aparecer sem abrir o cadastro. */
  corNome: string
  corHex: string | null
  lotes: number
  caixas: number
  pesoKg: number
  /** Null = sem mínimo cadastrado. Nunca 0 — ver o schema. */
  minimoCaixas: number | null
  estado: EstadoDaCor
}

/**
 * Uma linha por cor do fornecedor, com o estado contra o mínimo.
 *
 * ⚠️ COR SEM MÍNIMO CADASTRADO É SEMPRE 'ok'. Não se inventa limiar: um
 * "mínimo padrão" acenderia o sino de vinte cores no dia em que fosse ligado,
 * e um sino sempre aceso deixa de ser lido. Sem mínimo, a linha só informa.
 *
 * A ordem é a da urgência — acabou, abaixo, ok —, e dentro do grupo quem tem
 * menos saldo primeiro. O nome e o id no fim são o desempate que faz a mesma
 * lista sair sempre na mesma ordem (mesma razão do `id` em `ordenarParaGrade`).
 */
export function resumoPorCor(
  lotes: LoteComSaldo[],
  minimos: ReadonlyMap<string, number | null>,
): LinhaDoResumo[] {
  const porCor = new Map<string, LinhaDoResumo>()

  for (const l of lotes) {
    let linha = porCor.get(l.corFornecedorId)
    if (!linha) {
      linha = {
        corFornecedorId: l.corFornecedorId,
        corFornecedorNome: l.corFornecedorNome,
        corNome: l.corNome,
        corHex: l.corHex,
        lotes: 0,
        caixas: 0,
        pesoKg: 0,
        minimoCaixas: minimos.get(l.corFornecedorId) ?? null,
        estado: 'ok',
      }
      porCor.set(l.corFornecedorId, linha)
    }
    linha.lotes += 1
    linha.caixas += l.saldoCaixas
    linha.pesoKg += l.saldoPesoKg
  }

  const linhas = [...porCor.values()]
  for (const linha of linhas) {
    // 2 casas, como no rodapé da grade: somar floats de dez lotes sem
    // arredondar deixa centavo de kg sobrando.
    linha.pesoKg = Math.round(linha.pesoKg * 100) / 100
    linha.estado = estadoDaCor(linha.caixas, linha.minimoCaixas)
  }

  const PESO: Record<EstadoDaCor, number> = { acabou: 0, abaixo: 1, ok: 2 }
  return linhas.sort((a, b) => {
    if (PESO[a.estado] !== PESO[b.estado]) return PESO[a.estado] - PESO[b.estado]
    if (a.caixas !== b.caixas) return a.caixas - b.caixas
    const nome = compararTexto(a.corFornecedorNome, b.corFornecedorNome)
    if (nome !== 0) return nome
    return a.corFornecedorId.localeCompare(b.corFornecedorId)
  })
}

function estadoDaCor(
  caixas: number,
  minimo: number | null,
): EstadoDaCor {
  // Zerou com mínimo cadastrado é 'acabou' — o caso em que a máquina para.
  // Zerou SEM mínimo continua 'ok': ninguém disse que essa cor faz falta, e
  // várias das 24 cores do fornecedor são de peça que não se faz mais.
  if (minimo === null) return 'ok'
  if (caixas <= 0) return 'acabou'
  return caixas < minimo ? 'abaixo' : 'ok'
}

// -----------------------------------------------------------------
// Plano de retirada — de quais partidas sai o que ele vai pegar
// -----------------------------------------------------------------

export type ParteDaRetirada = {
  loteId: string
  numeroLote: string | null
  caixas: number
  /**
   * SUGESTÃO de kg: o kg médio por caixa DAQUELE lote × as caixas dele. Cada
   * lote tem seu kg por caixa (25, 30,91, 31,88 nos lotes reais), então um kg
   * médio da cor inteira erraria a conta em cada parte. É sugestão porque o
   * peso real só a balança sabe — o diálogo deixa editar.
   */
  kgSugerido: number
}

export type PlanoDeRetirada = {
  partes: ParteDaRetirada[]
  /** Caixas que o estoque da cor não cobre. 0 quando dá pra atender tudo. */
  faltou: number
}

/**
 * FIFO: o fio mais velho sai primeiro.
 *
 * ⚠️ O DESEMPATE É QUEM DECIDE DE VERDADE. Os 51 lotes de hoje têm TODOS a
 * mesma data de entrada (31/08/2025, a data de referência do import), então
 * ordenar só por data deixaria a ordem por conta do banco e o plano mudaria
 * de uma abertura pra outra, sem nada ter mudado. Partida e id depois da data
 * fazem a mesma entrada dar sempre o mesmo plano.
 *
 * Lote sem partida vai pro fim, como na grade: é a caixa que ninguém acha
 * pelo código, então não pode ser a primeira que o sistema manda pegar.
 *
 * Lote sem saldo não entra. Quando o estoque não cobre, `faltou` diz quanto —
 * quem decide o que fazer é a tela, que recusa e diz o saldo real.
 */
export function planoDeRetirada(
  lotesDaCor: LoteComSaldo[],
  caixas: number,
): PlanoDeRetirada {
  const fila = lotesDaCor
    .filter((l) => l.saldoCaixas > 0)
    .sort((a, b) => {
      const data = a.dataEntrada.localeCompare(b.dataEntrada)
      if (data !== 0) return data
      if (!a.numeroLote !== !b.numeroLote) return a.numeroLote ? -1 : 1
      const partida = compararTexto(a.numeroLote ?? '', b.numeroLote ?? '')
      if (partida !== 0) return partida
      return a.id.localeCompare(b.id)
    })

  const partes: ParteDaRetirada[] = []
  let restam = Math.max(0, Math.trunc(caixas))

  for (const l of fila) {
    if (restam === 0) break
    const tira = Math.min(restam, l.saldoCaixas)
    partes.push({
      loteId: l.id,
      numeroLote: l.numeroLote,
      caixas: tira,
      kgSugerido: kgSugeridoDoLote(l, tira),
    })
    restam -= tira
  }

  return { partes, faltou: restam }
}

/**
 * Kg médio por caixa DAQUELE lote × caixas, com 2 casas.
 *
 * Exportada porque o diálogo de retirada também sugere kg quando o gerente
 * escolhe a partida na mão — e as duas sugestões precisam ser a mesma conta,
 * senão o número muda ao trocar de modo sem o estoque ter mudado.
 */
export function kgSugeridoDoLote(lote: LoteComSaldo, caixas: number): number {
  if (lote.saldoCaixas <= 0) return 0
  const porCaixa = lote.saldoPesoKg / lote.saldoCaixas
  return Math.round(porCaixa * caixas * 100) / 100
}
