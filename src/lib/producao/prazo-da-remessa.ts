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
 * ESTIMATIVA de costura + separação, definida em 15/09/2026. É também o
 * MÍNIMO: "Produção até" não pode ser editado pra menos de 3 dias antes do
 * envio. O banco só impede passar do envio (58_remessa_producao_ate.sql) —
 * esta folga é política e muda aqui, sem migration.
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
 * Por que este "Produção até" não serve, ou null se serve. Nulo sempre serve
 * — é o padrão.
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
  if (diasEntre(producaoAte, dataEnvio) < FOLGA_DIAS_PRODUCAO) {
    return `A produção precisa terminar pelo menos ${FOLGA_DIAS_PRODUCAO} dias antes do envio (costura e separação)`
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
