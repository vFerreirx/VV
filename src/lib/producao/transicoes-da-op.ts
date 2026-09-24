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
  // Cancelar tem porta própria (`cancelarOrdemAction`), mas a regra vale
  // igual aqui: o Status manual não pode fazer o que o botão recusa.
  if (para === 'cancelado') return erroDoCancelamento(de)
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
//
// ⚠️ É TAMBÉM A LISTA DO ATRASO (atraso-da-op.ts): só pode estar atrasada a
// OP cuja produção ainda não foi concluída. Uma lista, duas perguntas — se
// um status novo entrar aqui, ele passa a poder ser concluído E a poder
// atrasar, sem uma segunda cópia pra esquecer.
export const ANTES_DA_CONCLUSAO = [
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

// ─────────────────────────────────────────────────────────────────────────
// DEVOLVER À FILA — o "Peguei errado"
// ─────────────────────────────────────────────────────────────────────────
//
// O operador toca na OP errada no "Iniciar", e até aqui só o gerente
// desfazia, arrastando no kanban. Devolver desfaz EXATAMENTE o que o
// `pegarOrdemAction` gravou, e mais nada:
//
//   status → 'programado'   máquina → null   responsável → null
//   data_real_inicio → null
//
// ⚠️ A DATA TEM QUE SAIR. O Iniciar só grava a data quando ela está vazia
// (`atual.dataRealInicio ?? new Date()`). Deixada aqui, o próximo Iniciar
// herdaria o início falso, e o tempo parado na fila viraria tempo de
// produção. (Consequência: a OP devolvida volta a poder ser EXCLUÍDA — ver
// `erroDaExclusao` abaixo. Está certo: ela não produziu nada; se tivesse
// produzido, teria apontamento, e o apontamento continua barrando.)
//
// O QUE NÃO MUDA: a remessa Full e o prazo. A OP continua indo pro mesmo
// lugar, só não está mais numa máquina.
//
// ⚠️ UMA REGRA, DOIS GESTOS: o "Peguei errado" do tablet e o arrastar do
// gerente de "Em produção" pra "Programado" (inclusive o "Desfazer" de um
// Iniciar no kanban) gravam isto, pela mesma função (devolucao-da-op.ts).

/** Por que esta OP não volta pra fila, ou null se volta. */
export function erroDaDevolucao(status: StatusDaOrdem): string | null {
  if (status === 'em_producao') return null
  return 'Só a OP em produção volta pra fila'
}

/** O que a OP devolvida grava — o avesso exato do Iniciar. */
export const OP_DEVOLVIDA = {
  status: 'programado',
  maquinaId: null,
  responsavelId: null,
  dataRealInicio: null,
} as const satisfies {
  status: StatusDaOrdem
  maquinaId: null
  responsavelId: null
  dataRealInicio: null
}

// ─────────────────────────────────────────────────────────────────────────
// CANCELAR E EXCLUIR SÃO COISAS DIFERENTES
// ─────────────────────────────────────────────────────────────────────────
//
// Antes os dois terminavam no mesmo lugar: "Excluir" gravava `cancelado` E
// `deletedAt`, e a lixeira devolvia a OP "como cancelada". O relatório não
// tinha como separar a OP que foi um engano da OP que a fábrica decidiu não
// fazer — e restaurar um engano trazia de volta uma OP cancelada que nunca
// tinha sido cancelada.
//
//   CANCELAR — a OP existiu e a fábrica desistiu. Vai pra `cancelado` e
//              continua VISÍVEL em Canceladas: é informação sobre a fábrica.
//   EXCLUIR  — a OP foi um engano de cadastro. Grava só `deletedAt`, sem
//              mexer no status, e restaurar da lixeira devolve a OP
//              exatamente como estava.
//
// ⚠️ A MESMA FUNÇÃO RESPONDE À TELA E AO SERVIDOR, como as portas acima: a
// tela esconde o botão com ela, a action recusa com ela — inclusive no lote.

/**
 * Por que esta OP não pode ser cancelada, ou null se pode.
 *
 * OP com BAIXA não cancela: a peça já foi enviada ou já repôs o estoque, e
 * cancelar diria que ela "não foi feita". (A frase falava em "entrada no
 * estoque" até pra OP de Full — e a fábrica nem controla mais saldo; o que
 * existe é a fila de reposição.)
 */
export function erroDoCancelamento(status: StatusDaOrdem): string | null {
  if (status === 'enviado') {
    return 'OP com baixa não cancela: a peça já foi enviada ou já repôs o estoque'
  }
  if (status === 'cancelado') return 'Essa OP já está cancelada'
  return null
}

// Status que só existem DEPOIS de a OP entrar numa máquina. Entra na regra da
// exclusão junto com `dataRealInicio`, e não no lugar dela: a data cobre a OP
// que entrou em produção e voltou pra fila por outro caminho que não o
// "devolver" (que limpa a data de propósito — ver acima); o status cobre o
// legado que chegou nessas colunas sem a data preenchida.
const STATUS_DEPOIS_DA_MAQUINA = [
  'em_producao',
  'acabamento',
  'embalagem',
  'pronto_envio',
  'enviado',
] as const satisfies readonly StatusDaOrdem[]

/**
 * Por que esta OP não pode ser EXCLUÍDA, ou null se pode.
 *
 * Só se exclui o engano: OP que nunca entrou em produção e não tem
 * apontamento. Máquina planejada não impede — planejar não é produzir. Pra
 * todo o resto a resposta é Cancelar, que deixa o registro à vista.
 */
export function erroDaExclusao(op: {
  status: StatusDaOrdem
  dataRealInicio: Date | string | null
  temApontamento: boolean
}): string | null {
  if (op.temApontamento) {
    return 'Essa OP tem apontamento. Use Cancelar'
  }
  if (
    op.dataRealInicio !== null ||
    (STATUS_DEPOIS_DA_MAQUINA as readonly string[]).includes(op.status)
  ) {
    return 'Essa OP já entrou em produção. Use Cancelar'
  }
  return null
}
