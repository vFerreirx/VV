// Agrupamento do estoque de fios por COR — a pergunta que a fábrica faz
// todo dia é "tenho Cáqui?", não "o que entrou na terça".
//
// Agrupa pela cor do CATÁLOGO, não pelo nome do fornecedor: dois nomes de
// fornecedor podem apontar pra mesma cor nossa (hoje "Black" → "Preto" já
// é esse caso), e nesse caso o estoque é um só. O nome do fornecedor
// continua visível em cada lote, que é onde ele importa — é por ele que se
// confere a etiqueta da caixa.
//
// Lógica PURA: o saldo de cada lote já chega calculado do banco (uma
// consulta agregada pra lista inteira, sem N+1); aqui só se agrupa e
// ordena.

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

export type SaldoDaCor = {
  corId: string
  corNome: string
  corHex: string | null
  saldoCaixas: number
  saldoPesoKg: number
  // Todos os lotes da cor, inclusive os zerados — some com o lote e o
  // usuário perde o histórico de onde o fio foi parar.
  lotes: LoteComSaldo[]
  lotesComSaldo: number
}

/**
 * Uma linha por cor do catálogo, em ordem alfabética.
 *
 * Alfabética de propósito, e não "com saldo primeiro": a lista é usada como
 * índice ("cadê o Cáqui?"), e reordenar por saldo faria a cor mudar de
 * lugar sozinha entre uma visita e outra. Cor zerada continua na lista —
 * "não tenho" é uma resposta tão útil quanto "tenho", e some da lista
 * significaria "essa cor não existe".
 */
export function agruparSaldoPorCor(lotes: LoteComSaldo[]): SaldoDaCor[] {
  const porCor = new Map<string, SaldoDaCor>()

  for (const lote of lotes) {
    let cor = porCor.get(lote.corId)
    if (!cor) {
      cor = {
        corId: lote.corId,
        corNome: lote.corNome,
        corHex: lote.corHex,
        saldoCaixas: 0,
        saldoPesoKg: 0,
        lotes: [],
        lotesComSaldo: 0,
      }
      porCor.set(lote.corId, cor)
    }
    cor.lotes.push(lote)
    cor.saldoCaixas += lote.saldoCaixas
    cor.saldoPesoKg += lote.saldoPesoKg
    if (lote.saldoCaixas > 0) cor.lotesComSaldo += 1
  }

  const cores = [...porCor.values()]
  for (const cor of cores) {
    // Centavos de kg acumulados na soma de 50 lotes viram dízima — o banco
    // guarda 2 casas, a soma tem que respeitar as mesmas 2.
    cor.saldoPesoKg = Math.round(cor.saldoPesoKg * 100) / 100
    // Dentro da cor: o que dá pra usar primeiro, e entre esses o mais
    // antigo — é o fio que a fábrica tem que consumir antes (FIFO).
    // Esgotado vai pro fim, sem sumir.
    cor.lotes.sort((a, b) => {
      const vivoA = a.saldoCaixas > 0 ? 0 : 1
      const vivoB = b.saldoCaixas > 0 ? 0 : 1
      if (vivoA !== vivoB) return vivoA - vivoB
      if (a.dataEntrada !== b.dataEntrada)
        return a.dataEntrada.localeCompare(b.dataEntrada)
      return (a.numeroLote ?? '').localeCompare(b.numeroLote ?? '', 'pt-BR')
    })
  }

  return cores.sort((a, b) => a.corNome.localeCompare(b.corNome, 'pt-BR'))
}

export type TotalGeralFios = {
  cores: number
  coresComSaldo: number
  lotes: number
  saldoCaixas: number
  saldoPesoKg: number
}

// O rodapé da tela — é com ele que se confere contra a planilha.
export function totalGeral(cores: SaldoDaCor[]): TotalGeralFios {
  const saldoPesoKg = cores.reduce((s, c) => s + c.saldoPesoKg, 0)
  return {
    cores: cores.length,
    coresComSaldo: cores.filter((c) => c.saldoCaixas > 0).length,
    lotes: cores.reduce((s, c) => s + c.lotes.length, 0),
    saldoCaixas: cores.reduce((s, c) => s + c.saldoCaixas, 0),
    saldoPesoKg: Math.round(saldoPesoKg * 100) / 100,
  }
}
