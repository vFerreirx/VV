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
