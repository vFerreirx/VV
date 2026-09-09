// UMA CONTA NA TELA, DUAS ORIGENS PRESERVADAS.
//
// `atacado_5` guarda o fechamento manual (inclusive o histórico da antiga
// Conta 5); `atacado_pedidos` guarda o espelho dos pedidos. As duas aparecem
// como "Pedidos finalizados". Manter as chaves de gravação permite editar o
// manual sem apagar pedidos, e reabrir um pedido sem apagar vendas manuais.
// Não unifique as chaves no salvamento: a união acontece SÓ na leitura para
// exibição. Por isso não é preciso alterar registros antigos nem o schema.

export const CONTA_ATACADO_MANUAL = 'atacado_5'
export const CONTA_ATACADO_PEDIDOS = 'atacado_pedidos'

export function contaParaExibicao(conta: string): string {
  return conta === CONTA_ATACADO_MANUAL ? CONTA_ATACADO_PEDIDOS : conta
}

type ResumoConta = {
  conta: string
  marketplace: string
  quantidade: number
  faturamento: string | null
}

// Diário e mensal usam a mesma soma. Valores em centavos durante a conta;
// null continua significando "não informado" quando nenhuma origem tem valor.
// Não altera a entrada: o formulário ainda precisa das origens separadas.
export function somarContasParaExibicao(linhas: readonly ResumoConta[]): ResumoConta[] {
  const agrupadas = new Map<string, {
    conta: string
    marketplace: string
    quantidade: number
    centavos: number | null
  }>()
  for (const linha of linhas) {
    const conta = contaParaExibicao(linha.conta)
    const chave = `${linha.marketplace}|${conta}`
    const atual = agrupadas.get(chave) ?? {
      conta,
      marketplace: linha.marketplace,
      quantidade: 0,
      centavos: null,
    }
    atual.quantidade += linha.quantidade
    if (linha.faturamento !== null) {
      atual.centavos = (atual.centavos ?? 0) + Math.round(Number(linha.faturamento) * 100)
    }
    agrupadas.set(chave, atual)
  }
  return [...agrupadas.values()].map(({ centavos, ...conta }) => ({
    ...conta,
    faturamento: centavos === null ? null : (centavos / 100).toFixed(2),
  }))
}
