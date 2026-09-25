// CORRIGIR QUANTIDADES — regra pura, sem banco.
//
// Irmão de `conclusao.ts`. Aquele registra o número na saída da máquina;
// este conserta o número depois (Q183). Antes não havia como: o Desfazer
// exige a máquina livre — de manhã ela já está com outra OP — e o apontamento
// avulso só somava.
//
// ─────────────────────────────────────────────────────────────────────────
// QUEM, QUANDO, QUANTO
// ─────────────────────────────────────────────────────────────────────────
//
//   - Só gerente e admin (`isManagerRole` + escrita no kanban). É conferência,
//     e conferência é de quem planejou.
//   - Só OP com a produção concluída: pronta (esperando o despacho do Full)
//     ou finalizada — inclusive o Full já despachado.
//   - Sem teto: o teto é só do operador (conclusao.ts). Se a fábrica fez 32
//     numa OP de 30, alguém tem que conseguir registrar.
//   - 0 e 0 não é correção: é dizer que a OP não produziu nada, e isso é o
//     Desfazer (ou Cancelar), não um número.
//
// ─────────────────────────────────────────────────────────────────────────
// O NÚMERO MUDA NO DIA EM QUE A PRODUÇÃO ACONTECEU
// ─────────────────────────────────────────────────────────────────────────
//
// As "Peças concluídas por dia" contam pelo `inicio` do apontamento. Uma
// linha nova com a diferença cairia no dia da CORREÇÃO, e uma linha negativa
// faria o dia de hoje perder peças que ninguém perdeu hoje. Então a correção
// ALTERA as linhas que já existem, sem mexer no `inicio`:
//
//   - o que AUMENTA vai pra linha mais recente (a da conclusão);
//   - o que DIMINUI sai da mais recente pra mais antiga, sem ficar negativo
//     (OP legada, com apontamento antes da conclusão);
//   - a linha que fica 0 e 0 é apagada — uma linha zerada só suja;
//   - OP SEM apontamento (concluída com 0 e 0 por uma OP legada) ganha uma
//     linha, que quem chama grava no instante da conclusão.
//
// Peças boas e defeito são redistribuídos cada um por si.
//
// O RASTRO FICA NO `eventos_kanban`: um evento SEM transição (status
// anterior = novo = atual), com o antes e o depois. O resumo gravado na
// conclusão continua no histórico como foi escrito — é o registro do que foi
// dito naquela hora, e a correção logo acima dele diz o que mudou.

import type { StatusDaOrdem } from './destino-da-ordem'

export type Quantidades = { boas: number; defeito: number }

/** Por que esta correção não pode ser gravada, ou null se pode. */
export function erroDaCorrecao(
  status: StatusDaOrdem,
  atual: Quantidades,
  novo: Quantidades,
): string | null {
  if (status !== 'pronto_envio' && status !== 'enviado') {
    return 'Só dá pra corrigir OP com a produção concluída'
  }
  if (!Number.isInteger(novo.boas) || novo.boas < 0) {
    return 'Quantidade de peças boas inválida'
  }
  if (!Number.isInteger(novo.defeito) || novo.defeito < 0) {
    return 'Quantidade com defeito inválida'
  }
  if (novo.boas === 0 && novo.defeito === 0) {
    return 'Zero e zero não é correção. Se a OP não produziu, desfaça a conclusão'
  }
  if (novo.boas === atual.boas && novo.defeito === atual.defeito) {
    return 'Os números são os mesmos de agora'
  }
  return null
}

/** "Quantidades corrigidas: 30 → 27 peças boas · 0 → 3 com defeito" */
export function textoDaCorrecao(atual: Quantidades, novo: Quantidades): string {
  return `Quantidades corrigidas: ${atual.boas} → ${novo.boas} peças boas · ${atual.defeito} → ${novo.defeito} com defeito`
}

export type ApontamentoParaCorrigir = { id: string } & Quantidades

export type PlanoDaCorrecao = {
  /** Linhas que mudam de número, já com o número novo. */
  atualizar: ApontamentoParaCorrigir[]
  /** Linhas que ficaram 0 e 0. */
  apagar: string[]
  /** Linha nova, só quando a OP não tinha apontamento nenhum. */
  criar: Quantidades | null
}

/**
 * Como os apontamentos ficam depois da correção.
 *
 * @param apontamentos da OP, do MAIS ANTIGO pro mais recente (pelo `inicio`).
 */
export function planoDaCorrecao(
  apontamentos: readonly ApontamentoParaCorrigir[],
  novo: Quantidades,
): PlanoDaCorrecao {
  if (apontamentos.length === 0) {
    return { atualizar: [], apagar: [], criar: { ...novo } }
  }
  const boas = redistribuir(
    apontamentos.map((a) => a.boas),
    novo.boas,
  )
  const defeito = redistribuir(
    apontamentos.map((a) => a.defeito),
    novo.defeito,
  )

  const plano: PlanoDaCorrecao = { atualizar: [], apagar: [], criar: null }
  apontamentos.forEach((a, i) => {
    if (boas[i] === 0 && defeito[i] === 0) {
      plano.apagar.push(a.id)
    } else if (boas[i] !== a.boas || defeito[i] !== a.defeito) {
      plano.atualizar.push({ id: a.id, boas: boas[i], defeito: defeito[i] })
    }
  })
  return plano
}

// Leva a soma de `valores` pra `alvo`: sobe na última posição, desce da
// última pra primeira sem passar de zero.
function redistribuir(valores: readonly number[], alvo: number): number[] {
  const novos = [...valores]
  let delta = alvo - novos.reduce((s, v) => s + v, 0)
  if (delta > 0) {
    novos[novos.length - 1] += delta
    return novos
  }
  for (let i = novos.length - 1; i >= 0 && delta < 0; i--) {
    const tira = Math.min(novos[i], -delta)
    novos[i] -= tira
    delta += tira
  }
  return novos
}
