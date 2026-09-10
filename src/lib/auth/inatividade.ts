// LOGOFF POR INATIVIDADE NO TABLET DA ESTAÇÃO — constantes compartilhadas.
//
// Puro de propósito: o mesmo arquivo é lido pelo `proxy.ts` (que impõe) e
// pelo componente de cliente (que avisa antes). Dois números iguais escritos
// em dois lugares viram, um dia, um aviso que aparece depois da porta já ter
// fechado.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUE INATIVIDADE, E NÃO TEMPO DE SESSÃO
// ─────────────────────────────────────────────────────────────────────────
//
// O tablet é compartilhado, e o risco é o operador da noite registrar no
// nome do operador do dia. Um timer fixo desde o login dispara num momento
// sem relação com a saída de ninguém — quem entrou atrasado é derrubado no
// meio do turno. Horário de turno o sistema não sabe (as colunas
// operador_dia_id/operador_noite_id das estações são legado morto).
//
// O INTERVALO OCIOSO É A TROCA DE TURNO. É o único sinal que existe de que a
// pessoa foi embora, e ele nunca interrompe trabalho: por definição, quando
// dispara, ninguém está trabalhando.
//
// ⚠️ E ISTO SÓ É ACEITÁVEL PORQUE O PIN EXISTE. Derrubar alguém por meia hora
// parado seria crueldade se voltar custasse digitar senha alfanumérica num
// tablet. Com quatro dígitos é um não-evento. As duas coisas se sustentam:
// sozinha, cada uma é pior.
//
// ─────────────────────────────────────────────────────────────────────────
// QUEM MARCA A ATIVIDADE É O TOQUE, NÃO A REQUEST
// ─────────────────────────────────────────────────────────────────────────
//
// ⚠️ O cookie de atividade é escrito pelo CLIENTE, em pointerdown/keydown, e
// o servidor só LÊ. Renovar no proxy a cada request pareceria mais simples e
// estaria errado: a tela do operador escuta realtime, então uma OP que o
// COLEGA move dispara `router.refresh()` aqui — e o tablet do operador que
// já foi pra casa ficaria vivo pra sempre por causa do trabalho de outra
// pessoa. Request não é presença.
//
// Por isso o cookie NÃO é httpOnly: o JS precisa escrever. Ele guarda um
// timestamp e nada mais, e o pior que alguém faz mexendo nele é esticar a
// própria sessão — o que já se consegue tocando na tela.

/** Marca que a sessão é de um operador (o proxy não consulta o banco). */
export const COOKIE_OPERADOR = 'vv_op'

/** Timestamp em ms do último toque de verdade. Escrito pelo cliente. */
export const COOKIE_ATIVIDADE = 'vv_atividade'

export const MINUTOS_DE_INATIVIDADE = 30

/** Quanto antes o aviso aparece, com o contador correndo. */
export const SEGUNDOS_DE_AVISO = 60

export const LIMITE_MS = MINUTOS_DE_INATIVIDADE * 60_000

/**
 * Passou do limite? `ultimoToque` ausente conta como "agora" — a sessão
 * acabou de nascer e ainda não houve toque nenhum.
 *
 * ⚠️ O padrão em caso de dúvida é NÃO derrubar. Um cookie ilegível
 * derrubando o operador no meio do turno é pior que uma sessão que dura um
 * pouco mais do que devia: o primeiro custa trabalho perdido, o segundo
 * custa um nome errado num registro que o histórico ainda desmente.
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
