// O PRAZO DA PRODUÇÃO DE UMA REMESSA FULL — regra pura, sem banco.
//
// Remessa Full é um envio pro Mercado Livre ou pra Shopee com data marcada.
// Só que a peça que sai da malharia ainda passa por COSTURA e SEPARAÇÃO antes
// do caminhão. Enquanto o sistema tratava a data de envio como prazo da
// produção, o "atrasada" só acendia quando o envio já tinha saído — tarde
// demais pra qualquer coisa além de lamentar.
//
// Então a remessa tem DOIS prazos:
//
//   data de envio   — quando o caminhão sai. É o marketplace que decide.
//   produção até    — quando a malharia tem que ter terminado. É a data de
//                     envio menos a folga, ou o dia que alguém escolher.
//
// ⚠️ ESTE ARQUIVO É A FONTE ÚNICA. Os dois formulários que criam remessa, a
// edição, o risco do card, o alerta do dashboard e o prazo das OPs leem daqui.
// Duas contas de "envio menos a folga" em dois lugares viram, um dia, um card
// "no prazo" com as OPs dele atrasadas.

import { diasEntre, somarDias } from '../dia-brasil.ts'

/**
 * Folga entre o fim da produção e o envio, em dias de calendário.
 *
 * ESTIMATIVA de costura + separação, definida em 15/09/2026. É o PADRÃO do
 * "Produção até", e NÃO um mínimo: menos que isso é permitido, com aviso
 * (`avisoDoProducaoAte`). Remessa urgente — envio em 1 ou 2 dias — precisa
 * poder nascer com um prazo possível; com a folga como bloqueio, ela nascia
 * atrasada e sem como ajustar.
 *
 * O único bloqueio é a produção terminar DEPOIS do envio — o mesmo CHECK de
 * 58_remessa_producao_ate.sql. A folga é política e muda aqui, sem migration.
 */
export const FOLGA_DIAS_PRODUCAO = 3

/** Quantos dias (ou menos) faltando pro prazo da produção já são "em risco". */
export const RISCO_DIAS = 2

/** O padrão: data de envio menos a folga. */
export function producaoAtePadrao(dataEnvio: string): string {
  return somarDias(dataEnvio, -FOLGA_DIAS_PRODUCAO)
}

/**
 * O prazo que VALE: o escolhido, ou o padrão quando ninguém escolheu.
 *
 * NULO É O PADRÃO, e não "sem prazo": é o que faz mudar a data de envio
 * arrastar o prazo junto enquanto ninguém mexeu nele.
 */
export function producaoAteEfetivo(remessa: {
  dataEnvio: string
  producaoAte: string | null
}): string {
  return remessa.producaoAte ?? producaoAtePadrao(remessa.dataEnvio)
}

/**
 * Por que este "Produção até" NÃO PODE ser salvo, ou null se pode. Nulo sempre
 * pode — é o padrão.
 *
 * ⚠️ SÓ O IMPOSSÍVEL BLOQUEIA: data inválida, ou a produção terminar depois
 * do envio (o CHECK da migration 58). Folga curta é AVISO, e mora na função
 * de baixo — misturar as duas era o que travava a remessa urgente.
 */
export function erroDoProducaoAte(
  dataEnvio: string,
  producaoAte: string | null,
): string | null {
  if (producaoAte === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(producaoAte)) return 'Data inválida'
  if (producaoAte > dataEnvio) {
    return 'A produção não pode terminar depois do envio'
  }
  return null
}

/**
 * O aviso de folga curta, ou null. Não impede salvar.
 *
 * Null no padrão (que é a folga exata), quando já há erro (a tela não mostra
 * erro e aviso juntos) e com folga suficiente.
 */
export function avisoDoProducaoAte(
  dataEnvio: string,
  producaoAte: string | null,
): string | null {
  if (producaoAte === null) return null
  if (erroDoProducaoAte(dataEnvio, producaoAte) !== null) return null
  if (diasEntre(producaoAte, dataEnvio) < FOLGA_DIAS_PRODUCAO) {
    return `Menos de ${FOLGA_DIAS_PRODUCAO} dias pra costura e separação`
  }
  return null
}

/**
 * O prazo da OP: fim do dia do "produção até", no horário de Brasília — a
 * mesma hora que as OPs de Full sempre usaram, só que no dia certo.
 */
export function prazoDaOp(producaoAte: string): Date {
  return new Date(`${producaoAte}T23:59:59-03:00`)
}

export type RiscoDaRemessa =
  | 'no_prazo'
  | 'em_risco'
  | 'atrasada'
  | 'baixa_pendente'

/**
 * A situação da remessa ABERTA (com alguma OP sem baixa).
 *
 * ⚠️ O VERMELHO É SÓ PRAZO DE PRODUÇÃO FURADO. "O envio passou e ainda tem OP
 * sem baixa" com a produção toda concluída não é atraso da malharia: é
 * pendência de baixa — âmbar, com nome próprio, pra ninguém ler como
 * "atrasou" o que é "esqueceram de fechar".
 *
 * `diasAteProducao` e `diasAteEnvio` são dias de calendário a partir de hoje
 * em Brasília; negativo = já passou.
 */
export function riscoDaRemessa({
  producaoConcluida,
  diasAteProducao,
  diasAteEnvio,
}: {
  producaoConcluida: boolean
  diasAteProducao: number
  diasAteEnvio: number
}): RiscoDaRemessa {
  if (producaoConcluida) {
    return diasAteEnvio < 0 ? 'baixa_pendente' : 'no_prazo'
  }
  if (diasAteProducao < 0) return 'atrasada'
  if (diasAteProducao <= RISCO_DIAS) return 'em_risco'
  return 'no_prazo'
}

/**
 * "Full ML · 30/09" — como uma remessa se chama em todo lugar (histórico da
 * OP, destino, card). Aqui, e não com o CANAL_LABEL dos validators, pra este
 * módulo continuar sem dependência e rodar no runner do Node.
 */
export function rotuloDaRemessa(canal: string, dataEnvio: string): string {
  const nome =
    canal === 'full_ml' ? 'Full ML' : canal === 'full_shopee' ? 'Full Shopee' : canal
  const [, m, d] = dataEnvio.split('-')
  return `${nome} · ${d}/${m}`
}

/** "27/09" — dia e mês de uma data 'YYYY-MM-DD'. */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

// -----------------------------------------------------------------
// O EVENTO DO CALENDÁRIO: de qual conta é este envio
// -----------------------------------------------------------------
//
// São 6 contas (3 do ML, 3 da Shopee), cada uma com um CNPJ atrás. Dizer só
// "Full ML" no calendário deixa de fora justamente o que decide o que vai na
// caixa — e quem separa o lote precisa saber ANTES de montar, não depois.
//
// Evento antigo não tem conta, e isso é permanente (ver a migration 69): o
// rótulo cai no canal sozinho, sem inventar uma conta que ninguém escolheu.

/** "Full ML · Conta 1" — ou só "Full ML" quando o evento não tem conta. */
export function rotuloDoEventoFull(
  canal: string,
  contaNome: string | null,
): string {
  const nome =
    canal === 'full_ml'
      ? 'Full ML'
      : canal === 'full_shopee'
        ? 'Full Shopee'
        : // Canal desconhecido aparece como veio: o rótulo é pra LER, e
          // esconder o valor cru deixaria o dado estranho invisível.
          canal
  return contaNome ? `${nome} · ${contaNome}` : nome
}

// -----------------------------------------------------------------
// Evento manual que já virou remessa
// -----------------------------------------------------------------

/**
 * O evento agendado à mão corresponde a uma remessa REAL?
 *
 * Quem agenda o envio no calendário e depois cadastra a remessa em Ordens
 * acaba com duas marcas no mesmo dia — uma que é plano e outra que é fato.
 * A tela mostra as duas e marca a manual como "já virou remessa", com o
 * excluir ali: apagar sozinho seria decidir por quem agendou, e pode ser que
 * sejam dois envios mesmo, no mesmo dia e canal.
 *
 * MESMO DIA **E** MESMO CANAL. Só o dia não basta (dois canais podem sair no
 * mesmo dia) e só o canal, menos ainda.
 */
export function ehEventoDuplicado(
  evento: { data: string; canal: string },
  remessas: readonly { data: string; canal: string }[],
): boolean {
  return remessas.some(
    (r) => r.data === evento.data && r.canal === evento.canal,
  )
}
