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
//   enviado       → a FINALIZAÇÃO, que é o que põe peça no estoque. Desde
//                   25/09/2026 (Q180) ninguém a pede: a OP fora de remessa
//                   finaliza NA CONCLUSÃO (`finalizaNaConclusao`), e a de
//                   Full no DESPACHAR da remessa. O caminho genérico recusa
//                   sempre — e também recusa TIRAR a OP de Finalizada: as
//                   saídas são o Desfazer (`desfazerAlcanca`) e o Corrigir
//                   quantidades, que mantêm o estoque igual às peças boas.
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
 * outra quantidade — ela já tem a dela. Só pra OP de REMESSA: a de fora
 * finaliza na conclusão, e ir pra "Produção concluída" pelo arrastar a
 * deixaria parada lá, esperando uma baixa que ninguém mais dá.
 *
 * `foraDeRemessa` = `remessa_full_id` nulo — ver `finalizaNaConclusao`.
 */
export function erroDaTransicaoGenerica(
  de: StatusDaOrdem,
  para: StatusDaOrdem,
  temApontamento: boolean,
  foraDeRemessa: boolean,
): string | null {
  if (de === para) return null
  // Cancelar tem porta própria (`cancelarOrdemAction`), mas a regra vale
  // igual aqui: o Status manual não pode fazer o que o botão recusa.
  if (para === 'cancelado') return erroDoCancelamento(de)
  // FINALIZADA NÃO SAI POR AQUI. O genérico mudava o status e deixava a
  // entrada no estoque, a reposição e a data de fim como estavam.
  if (de === 'enviado') {
    return 'OP finalizada não muda de coluna. Pra consertar o número, use Corrigir quantidades'
  }
  if (para === 'em_producao') {
    return 'Pra entrar em produção, escolha a máquina (Iniciar na máquina…)'
  }
  if (para === 'pronto_envio' && (!temApontamento || foraDeRemessa)) {
    return 'Pra concluir a produção, informe as quantidades (Concluir produção…)'
  }
  if (para === 'enviado') {
    return foraDeRemessa
      ? 'A OP fora de remessa finaliza sozinha na conclusão da produção'
      : 'A OP de Full sai pelo Despachar da remessa'
  }
  return null
}

/**
 * Por que esta OP de remessa não vai no DESPACHO, ou null se vai. Só a partir
 * de Produção concluída, e com apontamento: o despacho sem apontamento caía
 * num fallback que dava entrada da META — uma OP de 30 que rendeu 27 contava
 * como 30. Sem apontamento a OP fica, nunca um número inventado.
 */
export function erroDoDespacho(
  status: StatusDaOrdem,
  temApontamento: boolean,
): string | null {
  if (status !== 'pronto_envio') return 'A produção dessa OP ainda não foi concluída'
  if (!temApontamento) return 'Essa OP não tem apontamento'
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
  // A mesma recusa do genérico: tirar de Finalizada deixaria o estoque com
  // as peças de uma OP que não está mais finalizada.
  if (de === 'enviado') {
    return 'OP finalizada não muda de status. Pra consertar o número, use Corrigir quantidades'
  }
  if ((STATUS_SO_PELA_PRODUCAO as readonly string[]).includes(para)) {
    return 'Entrar em produção e concluir a produção são feitos pela tela de Produção'
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
 * OP FINALIZADA não cancela: a peça já foi pro estoque, pro pedido ou pro
 * Full, e cancelar diria que ela "não foi feita". (Não diz "repôs o
 * estoque": nem toda OP de canal Estoque é de reposição — ver
 * `textoDaFinalizacao`.)
 */
export function erroDoCancelamento(status: StatusDaOrdem): string | null {
  if (status === 'enviado') {
    return 'OP finalizada não cancela: a peça já saiu. Pra consertar o número, use Corrigir quantidades'
  }
  if (status === 'cancelado') return 'Essa OP já está cancelada'
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// O FIM DA OP — quem finaliza na conclusão, e o que o aviso diz
// ─────────────────────────────────────────────────────────────────────────
//
// Até 25/09/2026 a OP terminava em dois tempos: a produção concluída e,
// depois, a BAIXA que o gerente dava. Com a fábrica rodando 24 h, as OPs que
// terminam de madrugada ficavam paradas esperando alguém (Q180). Agora:
//
//   FORA DE REMESSA → finaliza NA CONCLUSÃO, na mesma transação.
//   DE REMESSA      → continua em Produção concluída até o DESPACHAR da
//                     remessa, que é quando a peça sai de fato.
//
// ⚠️ O CRITÉRIO É ESTAR NUMA REMESSA, E NÃO O CANAL. As duas coisas andam
// juntas — `erroDaRemessaDaOp` (prazo-da-remessa.ts) exige remessa pro Full e
// recusa remessa pro resto, em toda porta que cria OP ou muda canal —, mas
// perguntar pelo canal abriria um terceiro estado ("Full sem remessa", as OPs
// de teste antigas) que não finalizaria em lugar nenhum.

/** Esta OP termina na conclusão da produção? */
export function finalizaNaConclusao(op: { remessaFullId: string | null }): boolean {
  return op.remessaFullId === null
}

// O QUE A FINALIZAÇÃO DIZ QUE FEZ — no aviso do "Terminei" e do "Concluir
// produção". Uma função só pros dois: quando eram dois ternários, um passou a
// dizer "estoque reposto" e o outro continuou em "entrou no estoque".
//
// ⚠️ CANAL ESTOQUE NÃO QUER DIZER REPOSIÇÃO. A Nova OP já abre no canal
// Estoque, então a OP que o gerente lança à mão pra ter peça na prateleira
// também é desse canal — e ela não repõe nada que alguém tenha marcado como
// acabando. "Estoque reposto" é só da OP DE REPOSIÇÃO, a ligada a um item da
// fila (`reposicoes_estoque.ordem_id`, o vínculo que a finalização fecha como
// "Reposto"); a outra só vai pro estoque.

export function textoDaFinalizacao(op: {
  canalDestino: string
  /** Ligada a um item da fila de reposição (/estoque) — ver `OrdemDetalhe`. */
  deReposicao: boolean
  /** O rótulo da remessa ("Full ML · 24/09"), ou null fora de remessa. */
  remessa: string | null
  /** O número do pedido, quando a OP produz o faltante de um. */
  pedidoNumero: number | null
}): string {
  if (op.remessa !== null) {
    return `Produção concluída · espera o despacho do ${op.remessa}`
  }
  if (op.canalDestino === 'estoque') {
    return op.deReposicao
      ? 'Finalizada · estoque reposto'
      : 'Finalizada · foi pro estoque'
  }
  if (op.pedidoNumero !== null) return `Finalizada · Pedido #${op.pedidoNumero}`
  return 'Finalizada'
}

// ─────────────────────────────────────────────────────────────────────────
// QUANDO O DESFAZER ALCANÇA A OP
// ─────────────────────────────────────────────────────────────────────────
//
// O Desfazer é "fiz agora e foi errado". Com a finalização saindo junto da
// conclusão, a OP fora de remessa já não fica em Produção concluída — então
// ele passa a aceitar também a OP FINALIZADA PELA CONCLUSÃO, desde que nada
// tenha acontecido com ela depois.
//
// ⚠️ "SAIU JUNTO" É O MESMO INSTANTE. Os dois eventos nascem na mesma
// transação, e `created_at` é `default now()` — o início da transação. Por
// isso a prova de que a finalização foi a da conclusão é o horário IGUAL: a
// que veio por outro caminho (o "Mudar destino" de um Full pronto pra
// Estoque) nasceu noutra transação, noutro instante, e não se desfaz por
// aqui — essa se corrige. Full despachado também não: a peça foi embora no
// caminhão.
//
// As outras guardas (máquina livre, no tablet só quem concluiu) continuam na
// action — esta regra só diz se a OP ainda está no ponto de desfazer.

export function desfazerAlcanca(op: {
  status: StatusDaOrdem
  remessaFullId: string | null
  /** A conclusão mais recente (evento COM transição pra pronto_envio). */
  conclusaoEm: Date | null
  /** A última TRANSIÇÃO da OP, qualquer que seja. */
  ultimaTransicao: { para: StatusDaOrdem; em: Date } | null
}): boolean {
  if (op.status === 'pronto_envio') return true
  return (
    op.status === 'enviado' &&
    finalizaNaConclusao(op) &&
    op.conclusaoEm !== null &&
    op.ultimaTransicao !== null &&
    op.ultimaTransicao.para === 'enviado' &&
    op.ultimaTransicao.em.getTime() === op.conclusaoEm.getTime()
  )
}

// ─────────────────────────────────────────────────────────────────────────
// O ESTOQUE SEGUE AS PEÇAS BOAS
// ─────────────────────────────────────────────────────────────────────────
//
// A `entrada_producao` de uma OP é SEMPRE a soma das peças boas dela quando
// ela está finalizada no canal Estoque, e zero em qualquer outro caso. Antes
// a entrada era dada "uma vez só" e ninguém mais mexia: desfazer, corrigir ou
// lançar peça depois deixava o estoque com o número velho. Quem grava é
// `sincronizarEntradaDaOp` (src/lib/db/entrada-da-op.ts), chamada por todo
// caminho que finaliza, desfinaliza ou muda peça de OP finalizada.

export function entradaEsperada(
  op: { status: StatusDaOrdem; canalDestino: string; excluida: boolean },
  pecasBoas: number,
): number {
  if (op.excluida || op.status !== 'enviado' || op.canalDestino !== 'estoque') {
    return 0
  }
  return Math.max(0, pecasBoas)
}

// ─────────────────────────────────────────────────────────────────────────
// A ORDEM NO MESMO INSTANTE — o histórico da OP
// ─────────────────────────────────────────────────────────────────────────
//
// Conclusão, apontamento e finalização nascem na mesma transação, com o MESMO
// `created_at`. Sem desempate a ordem era a do banco, e o histórico podia
// mostrar a OP finalizada antes de concluída. No mesmo instante vale a ordem
// em que as coisas aconteceram: a conclusão, o apontamento dela, os eventos
// sem transição (o "Destino" do Mudar destino) e a finalização por último.

export function posicaoNoMesmoInstante(
  item:
    | { tipo: 'apontamento' }
    | {
        tipo: 'status'
        statusAnterior: StatusDaOrdem | null
        statusNovo: StatusDaOrdem
      },
): number {
  if (item.tipo === 'apontamento') return 1
  if (item.statusAnterior === item.statusNovo) return 2
  if (item.statusNovo === 'enviado') return 3
  return 0
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
