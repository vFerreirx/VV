// BLOQUEIO POR INATIVIDADE NO TABLET DA ESTAÇÃO — constantes e regra pura.
//
// Puro de propósito: o mesmo arquivo é lido pelo `proxy.ts` (que marca a
// trava), pela guarda das actions (que recusa) e pelo componente de cliente
// (que pede o PIN). Dois números iguais escritos em dois lugares viram, um
// dia, uma tela que acha que está destravada enquanto o servidor recusa.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUE INATIVIDADE, E NÃO TEMPO DE SESSÃO
// ─────────────────────────────────────────────────────────────────────────
//
// O tablet é compartilhado, e o risco é o operador da noite registrar no
// nome do operador do dia. Um timer fixo desde o login dispara num momento
// sem relação com a saída de ninguém — quem entrou atrasado é travado no
// meio do turno. Horário de turno o sistema não sabe (as colunas
// operador_dia_id/operador_noite_id das estações são legado morto).
//
// O INTERVALO OCIOSO É A TROCA DE TURNO. É o único sinal que existe de que a
// pessoa foi embora, e ele nunca interrompe trabalho: por definição, quando
// dispara, ninguém está trabalhando.
//
// ─────────────────────────────────────────────────────────────────────────
// TRAVA, NÃO LOGOUT
// ─────────────────────────────────────────────────────────────────────────
//
// Antes, 30 minutos parado faziam `signOut` e mandavam pro /login com usuário
// e senha. Isso contradizia a própria justificativa ("só é aceitável porque o
// PIN existe"): o PIN só funciona com sessão de operador ATIVA
// (src/app/(auth)/login/actions.ts), então depois do logout ele não servia
// pra nada e voltar custava a senha alfanumérica que o PIN veio evitar.
//
// Agora a sessão FICA e o tablet TRAVA:
//   - a LEITURA continua: a grade atualiza, Fila e Terminadas abrem;
//   - a ESCRITA pede "Quem é você?" + PIN. Confirmou quem já estava, destrava;
//     escolheu outra pessoa, troca a sessão; e a ação tocada segue.
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ QUEM TRAVA É O SERVIDOR, E O COOKIE DO CLIENTE NÃO BASTA PRA ISSO
// ─────────────────────────────────────────────────────────────────────────
//
// O cookie de atividade (`vv_atividade`) é escrito pelo CLIENTE a cada toque,
// e o servidor só LÊ — renovar a cada request estaria errado: a tela escuta
// realtime, e uma OP que o COLEGA move faria o tablet de quem foi embora ficar
// vivo pelo trabalho de outra pessoa. Request não é presença.
//
// Por isso ele NÃO é httpOnly. Com logout isso era inofensivo — o pior que se
// fazia mexendo nele era esticar a própria sessão. COM TRAVA, NÃO É: se tocar
// na tela reescreve o cookie, qualquer toque (rolar a grade, abrir a Fila)
// destravaria o servidor sem PIN. Então a regra tem duas metades:
//
//   1. O PROXY, ao ver sessão de operador com atividade vencida, grava
//      `vv_travado` (httpOnly). JavaScript não apaga; só a confirmação de
//      PIN, a troca de operador e o login por senha apagam.
//   2. A GUARDA das actions recusa se houver `vv_travado` OU atividade
//      vencida. O "OU" cobre a action que chega antes de o proxy ter visto
//      a expiração — o tablet que dormiu e acordou direto num toque.
//
// E o cliente PARA de gravar a atividade assim que vê o limite passar. É isso
// que faz o primeiro toque depois de acordar o tablet travar em vez de
// renovar.
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ TODA ACTION DE ESCRITA QUE O OPERADOR ALCANÇA CHAMA A GUARDA
// ─────────────────────────────────────────────────────────────────────────
//
// `recusaSeTabletTravado()` (src/lib/auth/tablet-travado.ts). Hoje: pegar,
// soltar, apontar, concluir e desfazer conclusão, mudar status da OP, trocar
// status da máquina (parou/voltou) e criar o próprio PIN — este último porque,
// sem guarda, quem pega o tablet travado cria o PIN NA CONTA DE QUEM SAIU.
// `requireAreaEscrita` confere de reserva, pras áreas que o admin libere ao
// operador em /permissoes. ACTION NOVA DE ESCRITA ALCANÇÁVEL PELO OPERADOR SEM
// ESTA GUARDA É A TRAVA COM UMA PORTA ABERTA.
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ O RELÓGIO É O DO SERVIDOR
// ─────────────────────────────────────────────────────────────────────────
//
// O servidor compara o PRÓPRIO `Date.now()` com o horário gravado no cookie.
// Se o cliente gravasse o relógio do tablet, relógio fora de hora quebraria a
// trava nos dois sentidos: tablet ATRASADO mais de 30 min pareceria sempre
// vencido e travaria a cada toque — inclusive logo depois do PIN —, e tablet
// ADIANTADO nunca venceria. Então a página traz o horário do servidor, o
// cliente calcula a diferença (`offsetDoRelogio`) e grava e decide sempre em
// horário de servidor (`horaNoServidor`).

/** Marca que a sessão é de um operador (o proxy não consulta o banco). */
export const COOKIE_OPERADOR = 'vv_op'

/** Horário do último toque de verdade, em ms NO RELÓGIO DO SERVIDOR. */
export const COOKIE_ATIVIDADE = 'vv_atividade'

/** httpOnly. Presente = tablet travado. Só o servidor grava e apaga. */
export const COOKIE_TRAVADO = 'vv_travado'

export const MINUTOS_DE_INATIVIDADE = 30

export const LIMITE_MS = MINUTOS_DE_INATIVIDADE * 60_000

/**
 * A frase com que as actions recusam. O cliente COMPARA com ela pra abrir o
 * "Quem é você?" quando a trava vier do servidor antes de a tela ter
 * percebido (a janela de alguns segundos entre um e outro).
 */
export const ERRO_TABLET_TRAVADO =
  'Tablet travado. Toque em Destravar e confirme quem é você.'

/**
 * Passou do limite? `ultimoToque` ausente conta como "agora" — a sessão
 * acabou de nascer e ainda não houve toque nenhum.
 *
 * ⚠️ O padrão em caso de dúvida é NÃO travar. Um cookie ilegível travando o
 * operador no meio do turno custa trabalho parado; uma sessão que dura um
 * pouco mais do que devia custa um nome errado num registro que o histórico
 * ainda desmente.
 */
export function expirouPorInatividade(
  ultimoToque: string | undefined,
  agora = Date.now(),
): boolean {
  if (!ultimoToque) return false
  const ts = Number(ultimoToque)
  if (!Number.isFinite(ts) || ts <= 0) return false
  return agora - ts > LIMITE_MS
}

/**
 * Quanto somar ao relógio do tablet pra chegar no do servidor.
 *
 * `horaDoServidor` vem com a página; `horaDoTabletAoReceber` é o `Date.now()`
 * do tablet quando ela chega. O atraso da rede entra no erro — segundos,
 * contra uma janela de trinta minutos.
 */
export function offsetDoRelogio(
  horaDoServidor: number,
  horaDoTabletAoReceber: number,
): number {
  return horaDoServidor - horaDoTabletAoReceber
}

/** O `Date.now()` do tablet traduzido pro relógio do servidor. */
export function horaNoServidor(horaDoTablet: number, offset: number): number {
  return horaDoTablet + offset
}
