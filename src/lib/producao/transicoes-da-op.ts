// AS PORTAS DA OP — regra pura, sem banco.
//
// Irmão de `inicio-da-op.ts` e `conclusao.ts`. Este responde "dá pra levar
// esta OP pra lá por um caminho GENÉRICO?" — o arrastar do board, o Status
// manual do sheet e o select do formulário — e diz por que não quando não dá.
//
// ⚠️ TRÊS TRANSIÇÕES TÊM PORTA PRÓPRIA, porque cada uma registra algo que um
// "mudar status" não tem como perguntar:
//
//   em_producao   → a MÁQUINA. `iniciarProducaoAction` (gerente) e
//                   `pegarOrdemAction` (operador) validam impedimento e
//                   ocupação. Pelo caminho genérico a OP entrava em produção
//                   em lugar nenhum.
//   pronto_envio  → as QUANTIDADES. `concluirProducaoAction` grava o
//                   apontamento e a mudança numa transação só. Pelo caminho
//                   genérico a OP chegava na baixa sem peça registrada.
//   enviado       → a BAIXA, que é o que põe peça no estoque. Só a partir de
//                   `pronto_envio` e com apontamento: a baixa sem apontamento
//                   caía num fallback que dava entrada da META no estoque —
//                   uma OP de 30 que rendeu 27 entrava como 30. Sem
//                   apontamento é recusa, nunca um número inventado.
//
// ⚠️ A MESMA FUNÇÃO RESPONDE AO SERVIDOR E À TELA. O servidor recusa com a
// frase; a tela desabilita a opção com ela. Quando eram dois `if`, a tela
// oferecia o que o servidor recusava — e erro em botão que a tela ofereceu
// parece falha de quem clicou.

import type { StatusDaOrdem } from './destino-da-ordem'

/**
 * Por que o caminho GENÉRICO (arrastar, Status manual) não leva a OP de `de`
 * pra `para`, ou null se leva.
 *
 * `temApontamento` = existe ao menos uma linha em `apontamentos_producao`.
 * É a exceção que mantém a volta possível: uma OP que já foi concluída e
 * voltou uma coluna pode ir de novo pra "Produção concluída" sem inventar
 * outra quantidade — ela já tem a dela.
 */
export function erroDaTransicaoGenerica(
  de: StatusDaOrdem,
  para: StatusDaOrdem,
  temApontamento: boolean,
): string | null {
  if (de === para) return null
  if (para === 'em_producao') {
    return 'Pra entrar em produção, escolha a máquina (Iniciar na máquina…)'
  }
  if (para === 'pronto_envio' && !temApontamento) {
    return 'Pra concluir a produção, informe as quantidades (Concluir produção…)'
  }
  if (para === 'enviado' && de !== 'pronto_envio') {
    return 'A baixa só é dada depois da produção concluída'
  }
  if (para === 'enviado' && !temApontamento) {
    return 'Essa OP não tem apontamento. Lance as peças antes de dar baixa'
  }
  return null
}

// O FORMULÁRIO DE EDIÇÃO NÃO ESCOLHE NENHUM DOS TRÊS — nem com apontamento.
// Ele não tem como pedir máquina nem quantidade, e a volta com apontamento
// (que o board permite) é gesto de quem está olhando a esteira, não de quem
// está corrigindo cadastro. O status ATUAL continua aparecendo no select: o
// que some é a transição.
export const STATUS_SO_PELA_PRODUCAO = [
  'em_producao',
  'pronto_envio',
  'enviado',
] as const satisfies readonly StatusDaOrdem[]

export function erroDaTransicaoPeloFormulario(
  de: StatusDaOrdem,
  para: StatusDaOrdem,
): string | null {
  if (de === para) return null
  if ((STATUS_SO_PELA_PRODUCAO as readonly string[]).includes(para)) {
    return 'Entrar em produção, concluir a produção e dar baixa são feitos pela tela de Produção'
  }
  return null
}

// De onde o GERENTE pode concluir a produção. Tudo antes de `pronto_envio`,
// inclusive os legados acabamento/embalagem: é a OP que saiu do tear
// enquanto o board ainda não sabia dela — a virada do Trello, com os dois
// rodando em paralelo. O OPERADOR conclui só de `em_producao`: no tablet, a
// OP sai de uma máquina ou não sai de lugar nenhum.
const ANTES_DA_CONCLUSAO = [
  'aguardando_materia_prima',
  'programado',
  'em_producao',
  'acabamento',
  'embalagem',
] as const satisfies readonly StatusDaOrdem[]

export function podeConcluirProducao(
  status: StatusDaOrdem,
  gestor: boolean,
): boolean {
  if (status === 'em_producao') return true
  return gestor && (ANTES_DA_CONCLUSAO as readonly string[]).includes(status)
}
