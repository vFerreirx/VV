// A OP ATRASADA — regra pura, sem banco.
//
// ⚠️ ATRASADA É A PRODUÇÃO, E NÃO A FINALIZAÇÃO. Antes a OP ficava vermelha
// até `enviado`: uma OP concluída no prazo virava "atrasada" no dia seguinte
// só porque ninguém tinha dado baixa ainda. Isso pintava de vermelho um trabalho
// que a fábrica entregou no prazo, e escondia no meio dele o que de fato
// atrasou.
//
// Depois da conclusão, a OP fora de remessa já está finalizada (desde
// 25/09/2026), e o Full espera o despacho da remessa — cuja pendência, com o
// envio vencido, tem cor própria, âmbar ("Falta despachar" nas remessas).
// Vermelho é só pra produção que ainda não saiu da máquina.
//
// OS LEGADOS `acabamento` E `embalagem` CONTAM COMO NÃO CONCLUÍDOS: a lista é
// `ANTES_DA_CONCLUSAO`, a mesma que diz de onde o gerente ainda precisa
// concluir. Sem a conclusão não há quantidade registrada, então a produção
// não terminou no sistema.
//
// ⚠️ HÁ UMA CÓPIA EM SQL, pras contagens feitas no banco:
// `condicaoDeProducaoAtrasada` (src/lib/db/atraso-da-op.ts). Ela é montada
// com a MESMA lista importada daqui — não com os status redigitados.

import type { StatusDaOrdem } from './destino-da-ordem'
import { ANTES_DA_CONCLUSAO } from './transicoes-da-op.ts'

/** A produção ainda não foi concluída (o status está antes de `pronto_envio`). */
export function producaoNaoConcluida(status: StatusDaOrdem): boolean {
  return (ANTES_DA_CONCLUSAO as readonly string[]).includes(status)
}

/**
 * Tem prazo, o prazo venceu E a produção não foi concluída.
 *
 * `prazo` é o instante gravado em `data_prevista_fim` — o fim do dia em
 * Brasília (`prazoDaOp`) —, então comparar instantes já é comparar dias.
 */
export function producaoAtrasada(
  status: StatusDaOrdem,
  prazo: Date | string | null,
  agora: Date | number = Date.now(),
): boolean {
  if (prazo === null) return false
  if (!producaoNaoConcluida(status)) return false
  const t = typeof agora === 'number' ? agora : agora.getTime()
  return new Date(prazo).getTime() < t
}
